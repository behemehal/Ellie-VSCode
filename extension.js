/* jshint expr: true, esversion: 8 */
const vscode = require("vscode");
const process = require("process");
const os = require("os");
const cprocess = require("child_process");
const fs = require("fs");
const path = require("path");
const lib = require("./lib");

var CodeLensProvider = require("./codeLens");
var debugHeadersDecorator = require("./debugHeadersDecorator");
var syntaxRuntime = "ellie";
var syntaxErrors = vscode.languages.createDiagnosticCollection("test");
var checkSyntax = false;
var keypressSlowdown = 250;
var keypressTimer = null;
var serverPath = "";
var ellieExist = false;
var supported = "v2.6.0";

async function requestMap(context, document) {
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
        var diagnostics = [];
        var params = !vscode.window.activeTextEditor?.document.isUntitled
          ? [vscode.window.activeTextEditor?.document?.fileName, "-se", "-je"]
          : [
              "-se",
              "-je",
              "-ec",
              '"' + vscode.window.activeTextEditor.document.getText() + '"',
            ];

        lib
          .runCommand(serverPath, params)
          .then((returned) => {
            if (returned.includes("thread") && returned.includes("panicked")) {
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
              diagnostics = [];
            }
            syntaxErrors.set(
              vscode.window.activeTextEditor.document.uri,
              diagnostics
            );
          })
          .catch((err) => {
            console.log(err);
          });
      }
    }
  }
}

/**
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {
  var statusBar = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Right,
    100
  );
  var ellieFoundType = lib.whichType();

  if (ellieFoundType != -1) {
    if (!lib.workingEllieFound(ellieFoundType)) {
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
          var version = returned.split("Ellie")[1].split("-")[0].trim();
          if (supported == version) {
            var code = returned
              .split("Ellie")[1]
              .split("-")[1]
              .split(":")[1]
              .trim();
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
      console.log("Modifying ellie source");
      vscode.window.showInformationMessage(
        "You are modifying ellie source, highlighting debug lines for you"
      );
    }
  });

  vscode.commands.registerCommand("ellie.goToError", (args) => {
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
          console.log("1Error: ", err);
        });
      vscode.window.showInformationMessage(
        `CodeLens action clicked with args=${args}`
      );
    } catch (err) {
      console.log(err);
    }
  });

  vscode.languages.registerCodeLensProvider("*", new CodeLensProvider());

  //vscode.languages.registerCompletionItemProvider("ellie", )
  context.subscriptions.push(
    vscode.workspace.onDidChangeTextDocument((e) => {
      requestMap(context, e.document.uri);
    }),
    vscode.workspace.onDidOpenTextDocument((e) => {
      requestMap(context, e.uri);
    }),

    vscode.window.onDidChangeActiveTextEditor((editor) => {
      requestMap(context, editor.uri);
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
