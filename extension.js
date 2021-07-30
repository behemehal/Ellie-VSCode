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
var keypressSlowdown = 250;
var keypressTimer = null;
var busy = false;
var serverPath = "";
var version;
var ellieExist = false;
var supported = "v2.7.0";
var statusBar = vscode.window.createStatusBarItem(
  vscode.StatusBarAlignment.Right,
  100
);

async function requestMap(context, document) {
  if (keypressTimer == null) {
    if (vscode.workspace.getConfiguration("ellie").get("syntaxCheck")) {
      var checkFile =
        document?.scheme == "untitled" ||
        document?.scheme == "file" ||
        vscode.window.activeTextEditor?.document.languageId ==
          "EllieDebugHeaders" ||
        vscode.window.activeTextEditor?.document?.languageId == "ellie";
      var activeEditor =
        vscode.window.activeTextEditor ?? vscode.window.visibleTextEditors[0];
      if (checkFile && activeEditor) {
        if (
          vscode.window.activeTextEditor?.document?.languageId ==
          "EllieDebugHeaders"
        ) {
          debugHeadersDecorator(activeEditor);
        } else if (
          vscode.window.activeTextEditor?.document?.languageId == "ellie" &&
          !!vscode.window.activeTextEditor?.document?.fileName &&
          checkSyntax
        ) {
          var fileName = vscode.window.activeTextEditor?.document?.fileName;
          var diagnostics = [];
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

          var time = new Date().getTime();
          lib
            .runCommand(serverPath, params)
            .then((returned) => {
              if (
                returned.includes("thread") &&
                returned.includes("panicked")
              ) {
                checkSyntax = false;
                vscode.window.showErrorMessage(
                  "Ellie failed to parse the file and will not continue to provide syntax error checks. Please report this issue with your code",
                  "Open Ellie's Github Issues"
                );
                diagnostics = [];
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
                  diagnostics.push(
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
              } else {
                if (returned.includes("-")) {
                  var items = returned
                    .split("/")[1]
                    .split("-")
                    .filter((x) => x != "")
                    .map((x) => x.replaceAll("\\'", "'"))
                    .map(JSON.parse)
                    .map(JSON.parse);
                  diagnostics = [];
                  var warnings = new EllieSyntaxWarns(items).check();
                  warnings.forEach((item) => {
                    diagnostics.push(item);
                  });
                }
              }
              syntaxErrors.set(
                vscode.window.activeTextEditor.document.uri,
                diagnostics
              );
              ellieOutput.append(`[Info] Parsing ${vscode.window.activeTextEditor?.document.isUntitled ? "Untitled" : fileName} took ${new Date().getTime() - time}ms\n`)
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
  } else {
    if (keypressTimer != null) {
      console.log("TIME");
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
          if (supported == version) {
            var code = returned
              .split("Ellie")[1]
              .split("-")[1]
              .split(":")[1]
              .trim();
            ellieOutput.append(`[Info] Ellie ${version} is ready\n`);
            vscode.window.showInformationMessage("Ellie " + version);
            statusBar.text = "Ellie " + version;
          } else {
            vscode.window.showErrorMessage(
              `Supported ellie version by extension is ${version}, ellie version is: ${supported} features disabled`
            );
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
    ellieOutput.append(`[Error] Ellie formating requested\n`);
  });

  vscode.languages.registerDocumentFormattingEditProvider("ellie", {
    provideDocumentFormatingEdits: (document) => {
      ellieOutput.append(`[Error] Ellie formating requested 2\n`);
      return vscode.TextEdit;
    },
  });

  //vscode.languages.registerCompletionItemProvider("ellie", )
  context.subscriptions.push(
    vscode.workspace.onDidChangeTextDocument((e) => {
      requestMap(context, e.document.uri);
    }),
    vscode.workspace.onDidOpenTextDocument((e) => {
      requestMap(context, e.uri);
    }),

    vscode.window.onDidChangeActiveTextEditor((editor) => {
      if (editor) {
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
