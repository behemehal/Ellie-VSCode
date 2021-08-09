/* jshint expr: true, esversion: 8 */
const vscode = require("vscode");
const process = require("process");
const os = require("os");
const cprocess = require("child_process");
const fs = require("fs");
const path = require("path");
const lib = require("./lib");

const ellieOutput = vscode.window.createOutputChannel(`Ellie Output`);
var CodeLensProvider = require("./codeLens");
var EllieSyntaxWarns = require("./ellieSyntax");
var debugHeadersDecorator = require("./debugHeadersDecorator");
var syntaxRuntime = "ellie";
var syntaxErrors = vscode.languages.createDiagnosticCollection("syntax");
var checkSyntax = false;
var keypressSlowdown = 50;
var keypressTimer = null;
var busy = false;
var serverPath = "";
var version;
var ellieExist = false;
var supported = "3.0.2";
var diagnostics = {};
var statusBar = vscode.window.createStatusBarItem(
  vscode.StatusBarAlignment.Right,
  100
);

async function requestMap(context, document) {
  Object.entries(diagnostics).forEach((entry) => {
    diagnostics[entry[0]] = [];
    if (entry[0] == "<eval>") {
      syntaxErrors.set(
        vscode.Uri.file(vscode.window.activeTextEditor.document.uri),
        []
      );
    } else {
      syntaxErrors.set(vscode.Uri.file(entry[0]), []);
    }
  });
  if (keypressTimer == null) {
    if (vscode.workspace.getConfiguration("ellie").get("syntaxCheck")) {
      var checkFile =
        document?.scheme == "untitled" ||
        document?.scheme == "file" ||
        vscode.window.activeTextEditor?.document.languageId ==
          "EllieDebugHeaders" ||
        vscode.window.activeTextEditor?.document?.languageId == "ellie";
      if (
        checkFile &&
        vscode.window.activeTextEditor?.document?.languageId != "Log"
      ) {
        if (
          vscode.window.activeTextEditor?.document?.languageId ==
          "EllieDebugHeaders"
        ) {
          if (!!vscode.window.activeTextEditor) {
            debugHeadersDecorator(vscode.window.activeTextEditor);
          }
        } else if (
          vscode.window.activeTextEditor?.document?.languageId == "ellie" &&
          !!vscode.window.activeTextEditor?.document?.fileName &&
          checkSyntax
        ) {
          var fileName = vscode.window.activeTextEditor?.document?.fileName;
          var params = !vscode.window.activeTextEditor?.document.isUntitled
            ? [fileName, "-je", "-se"]
            : [
                "-se",
                "-je",
                "-ec",
                JSON.stringify(
                  vscode.window.activeTextEditor.document.getText()
                ),
              ];
          /*
          diagnostics.forEach((file) => {
            e = [];
          });
          */
          var time = new Date().getTime();
          lib
            .runCommand(serverPath, params)
            .then((returned) => {
              if (
                returned.includes("thread") &&
                returned.includes("panicked")
              ) {
                checkSyntax = false;
                ellieOutput.append(
                  `[Error] Ellie failed to parse the file and will not continue to provide syntax error checks.\n`
                );
                vscode.window
                  .showErrorMessage(
                    "Ellie failed to parse the file and will not continue to provide syntax error checks. Please report this issue with your code",
                    "Open Ellie's Github Issues",
                    "Re-enable"
                  )
                  .then((result) => {
                    if (result == "Open Ellie's Github Issues") {
                      vscode.env.openExternal(
                        vscode.Uri.parse(
                          "https://github.com/behemehal/Ellie-Language/issues/new?assignees=ahmtcn123&labels=bug&template=bug_report.md&title=Ellie%20Parser%20Failure"
                        )
                      );
                    } else if (result == "Re-enable") {
                      ellieOutput.append(
                        `[Warning] Ignoring ellie parsing error\n`
                      );
                      checkSyntax = true;
                    }
                  })
                  .catch((err) => {
                    console.log(err);
                  });
                /*
                diagnostics.forEach((file) => {
                  e = [];
                });
                */
              } else if (returned.includes("+") && returned.includes("*")) {
                var errors = returned
                  .split("*")[1]
                  .split("+")
                  .filter((x) => x != "")
                  .map((x) => x.replaceAll("\\'", "'"))
                  .map(JSON.parse)
                  .map(JSON.parse);
                for (error in errors) {
                  var error = errors[error];
                  if (!!!diagnostics[error.path]) {
                    diagnostics[error.path] = [];
                  }
                  diagnostics[error.path].push(
                    new vscode.Diagnostic(
                      new vscode.Range(
                        new vscode.Position(
                          error.pos.range_start[0],
                          error.pos.range_start[1]
                        ),
                        new vscode.Position(
                          error.pos.range_end[0],
                          error.pos.range_end[1]
                        )
                      ),
                      `${error.title}: ${error.builded_message.builded}`,
                      vscode.DiagnosticSeverity.Error
                    )
                  );
                }
              }

              Object.entries(diagnostics).forEach((entry) => {
                if (entry[0] == "<eval>") {
                  syntaxErrors.set(
                    vscode.Uri.file(
                      vscode.window.activeTextEditor.document.uri
                    ),
                    entry[1]
                  );
                } else {
                  syntaxErrors.set(vscode.Uri.file(entry[0]), entry[1]);
                }
              });
              ellieOutput.append(
                `[Info] Parsing ${
                  vscode.window.activeTextEditor?.document.isUntitled
                    ? "Untitled"
                    : fileName
                } took ${new Date().getTime() - time}ms\n`
              );
              keypressTimer = setTimeout(() => {
                keypressTimer = null;
              }, keypressSlowdown);
            })
            .catch((err) => {
              console.log(err);
            });
        }
      }
    }
  }
}

/**
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {
  var ellieFoundType = lib.whichType();

  if (ellieFoundType != -1) {
    if (!lib.workingEllieFound(ellieFoundType)) {
      ellieOutput.append(`[Error] Ellie is not found, syntax check disabled\n`);
      vscode.window.showErrorMessage(
        "Ellie is not found in system, install and restart your ide"
      );
      statusBar.text = "Ellie is not found";
    } else {
      serverPath = lib.resolveElliePath(ellieFoundType);
      statusBar.text = "Ellie is ready";
      ellieExist = true;
      checkSyntax = true;
      lib
        .runCommand(serverPath, ["-v"])
        .then((returned) => {
          version = returned.split("Ellie")[1].split("-")[0].trim();
          var parsed_supported = lib.versionParse(supported);
          var parsed_current = lib.versionParse(version.replace("v", ""));
          var version_check = lib.versionCheck(
            parsed_supported,
            parsed_current
          );
          var extension_update =
            parsed_supported[0] > parsed_current[0]
              ? false
              : parsed_supported[0] == parsed_current[0]
              ? parsed_supported[1] > parsed_current[1]
                ? false
                : parsed_supported[1] == parsed_current[1]
                ? parsed_supported[2] < parsed_current[2]
                : true
              : true;

          if (version_check.major && version_check.minor) {
            var code = returned
              .split("Ellie")[1]
              .split("-")[1]
              .split(":")[1]
              .trim();

            if (version_check.bug) {
              ellieOutput.append(`[Info] Ellie ${version} is ready\n`);
            } else {
              ellieOutput.append(
                `[Info] Ellie ${version} is ready, but update might be necessary\n`
              );
              vscode.window
                .showWarningMessage(
                  `Supported ellie version by extension is not same with your ellie, continuing anyway`,
                  extension_update
                    ? "Check Extension Releases"
                    : "Check Ellie Releases"
                )
                .then((label) => {
                  if (label == "Check Extension Releases") {
                    vscode.env.openExternal(
                      vscode.Uri.parse("vscode:extension/behemehal.ellie-lang")
                    );
                  } else if (label == "Check Ellie Releases") {
                    vscode.env.openExternal(
                      vscode.Uri.parse(
                        "https://github.com/behemehal/Ellie-Language/releases"
                      )
                    );
                  }
                });
            }
            vscode.window.showInformationMessage("Ellie " + version);
            statusBar.text = "Ellie " + version;
          } else {
            vscode.window
              .showErrorMessage(
                `Supported ellie version by extension is ${supported}, your ellie version is: ${version} features disabled`,
                extension_update
                  ? "Check Extension Releases"
                  : "Check Ellie Releases"
              )
              .then((label) => {
                if (label == "Check Extension Releases") {
                  vscode.env.openExternal(
                    vscode.Uri.parse("vscode:extension/behemehal.ellie-lang")
                  );
                } else if (label == "Check Ellie Releases") {
                  vscode.env.openExternal(
                    vscode.Uri.parse(
                      "https://github.com/behemehal/Ellie-Language/releases"
                    )
                  );
                }
              });

            checkSyntax = false;
          }
        })
        .catch((err) => {
          console.log(err);
        });
    }
  } else {
    statusBar.text = "Ellie is not found";
  }

  vscode.workspace.findFiles("DEBUG_HEADERS.eidbg").then((file) => {
    if (file.length != 0) {
      ellieOutput.append(`[Info] Modifying Ellie source code\n`);
      vscode.window.showInformationMessage(
        "You are modifying ellie source, highlighting debug lines for you"
      );
    }
  });

  vscode.commands.registerCommand("ellie.goToError", (args) => {
    ellieOutput.append(`[Info] Showing error from source code\n`);
    try {
      var fileData = fs
        .readFileSync(
          vscode.workspace.rootPath + "/DEBUG_HEADERS.eidbg",
          "utf8"
        )
        .toString();
      var pathFile = fileData
        .split(lib.whichLineEnding(fileData))
        [args.start._line].split(":")
        .slice(1)
        .join(":")
        .trim();
      var absPath = path.resolve(
        vscode.workspace.rootPath + pathFile.replace(".", "").split(":")[0]
      );
      var absLine = Number(pathFile.split(":")[1]);
      var setting = vscode.Uri.file(absPath);
      vscode.workspace
        .openTextDocument(setting)
        .then((a) => {
          return vscode.window.showTextDocument(a, absLine, false).then((q) => {
            let range = q.document.lineAt(absLine - 1).range;
            q.selection = new vscode.Selection(range.start, range.end);
            q.revealRange(range);
          });
        })
        .catch((err) => {
          ellieOutput.append(`[Error] Failed to show source code file\n`);
        });
    } catch (err) {
      ellieOutput.append(`[Error] Failed to show source code error\n`);
    }
  });

  vscode.languages.registerCodeLensProvider("*", new CodeLensProvider());

  vscode.commands.registerCommand("ellie.formatFile", () => {
    const { activeTextEditor } = vscode.window;
    ellieOutput.append(`[Error] Ellie formatting requested\n`);
  });

  vscode.languages.registerDocumentFormattingEditProvider("ellie", {
    provideDocumentFormattingEdits(document) {
      ellieOutput.append(`[Warning] Ellie formatting requested\n`);
      return vscode.TextEdit;
    },
  });

  context.subscriptions.push(
    vscode.workspace.onDidChangeTextDocument((e) => {
      if (
        (e.contentChanges.length != 0 || diagnostics.length != 0) &&
        (e.document.uri.scheme == "file" || e.document.uri.scheme == "untitled")
      ) {
        requestMap(context, e.document.uri);
      }
    }),
    vscode.workspace.onDidOpenTextDocument((e) => {
      if (e.uri.scheme == "file" || e.uri.scheme == "untitled") {
        requestMap(context, e.uri);
      }
    }),

    vscode.window.onDidChangeActiveTextEditor((editor) => {
      if (
        editor &&
        (editor.document.uri.scheme == "file" ||
          editor.document.uri.scheme == "untitled")
      ) {
        requestMap(context, editor.uri);
      }
    }),

    statusBar

    //vscode.window.onDidChangeVisibleTextEditors((e) => {
    //  requestMap(context, e[0]._documentData._uri);
    //})
  );
  statusBar.show();
}
exports.activate = activate;
function deactivate() {}

module.exports = {
  activate,
  deactivate,
};
