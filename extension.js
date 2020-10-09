/* jshint expr: true, esversion: 8 */
const vscode = require('vscode');
const cprocess = require("child_process");
const fs = require("fs");
const path = require("path");
const https = require("https");
var requiredEllieVersion = "v0.1.4";

var dowloadInProgress = false;
var syntaxCheckDisabled = false;
var syntaxRuntime = "ellie";
var syntaxErrors = vscode.languages.createDiagnosticCollection("test");
var dontAskDownload = false;
var isCustomServer = typeof vscode.workspace.getConfiguration("ellie").get("serverLocation") == "string";
var keypressSlowdown = 250;
var keypressTimer = null;

var elliePathAvailable = () => {
    var available = true;
    cprocess.spawn("node", ["-v"]).on("error", () => available = false)
    return available;
}

function downloadRuntime() {
    return new Promise((resolve) => {
        var link = "https://raw.githubusercontent.com/behemehal/Ellie-Engine/master/ellie_engine.exe";
        syntaxRuntime = __dirname + "\\ellieSyntaxCheck.exe"
        dowloadInProgress = true;
        vscode.window.withProgress({
            cancellable: false,
            location: vscode.ProgressLocation.Notification,
            title: "Downloading Ellie Syntax Checker"
        }, async  (q) => {
            await (() => {
                return new Promise((_resolve) => {
                    var file = fs.createWriteStream(syntaxRuntime);
                    https.get(link, { agent: new https.Agent({ keepAlive: true }) }, (res) => {
                        var len = parseInt(res.headers['content-length'], 10);
                        var downloaded = 0;
                        res.on('data', function(chunk) {
                            file.write(chunk);
                            downloaded += chunk.length;
                            q.report({
                                increment: Math.floor(100.0 * downloaded / len)
                            })
                            //process.stdout.write("Downloading " + (100.0 * downloaded / len).toFixed(2) + "% " + downloaded + " bytes" + "\033[0G");
                        });
                        res.on("end", () => {
                            vscode.window.showInformationMessage("Download complete, Ellie syntax check server installed")
                            file.end();
                            dowloadInProgress = false
                            _resolve();
                            resolve();
                        })
                    });
                })
            })();
        })
    });
}

function downloadRequest() {
    return new Promise(async (resolve) => {
        if (dontAskDownload) {
            await downloadRuntime();
            resolve();
        } else {
            vscode.window.showWarningMessage("Ellie not found in path, Ellie requires syntax check server for syntax hunt",[
                "Download",
                "Cancel"
            ],{
                modal: true
            }).then(async (e) => {
                if (e) {
                    await downloadRuntime();
                    resolve();
                } else {
                    syntaxCheckDisabled = true
                    resolve()
                }
            });
        }
    })
}

function ellieInPath() {
    return new Promise((resolve) => {
        if (typeof vscode.workspace.getConfiguration("ellie").get("serverLocation") == "string" && fs.existsSync(vscode.workspace.getConfiguration("ellie").get("serverLocation"))) {
            syntaxRuntime = vscode.workspace.getConfiguration("ellie").get("serverLocation");
        } else {
            if (typeof vscode.workspace.getConfiguration("ellie").get("serverLocation") == "string") {
                vscode.window.showWarningMessage("Specified syntax server location not available. Falling back to default configuration");
            }
            if (fs.existsSync(__dirname + "\\ellieSyntaxCheck.exe")) {
                syntaxRuntime = __dirname + "\\ellieSyntaxCheck.exe";
            } else {
                if (!elliePathAvailable()) {
                    vscode.window.showWarningMessage("Ellie syntax server not found.");
                }
            }
        }
        
        var process = cprocess.spawn(syntaxRuntime, ["--v"]);
        process.stdout.on('data', (data_) => {
            var data = data_.toString();
            if (data.slice(0, data.length-1) !== requiredEllieVersion) {
                if (isCustomServer) {
                    vscode.window.showWarningMessage(`Custom syntax check server is outdated [${requiredEllieVersion} > ${data}] Syntax check disabled`);
                    syntaxCheckDisabled = true
                } else {
                    vscode.window.showWarningMessage(`Ellie is outdated [${requiredEllieVersion} > ${data}]. Updating now`);
                    dontAskDownload = true
                }
            }
            if (data[0] == "v" && (data.slice(0, data.length-1) == requiredEllieVersion || isCustomServer)) {
                resolve(true)     
            } else {
                resolve(false)
            }
        });
        process.on('error', (err) => {
            resolve(false)
        });
    })
}

function isEven(n) {
    n = Number(n);
    return n === 0 || !!(n && !(n%2));
}

function isEmpty(x) {
    return x == undefined || x == null || x == "" || x == " "
}

async function map(context, document) {
    var diagnostics = [];
    if (document.isUntitled) {
         // TODO Support unsaved files
    } else {
        var uri = document.path ? document : document.uri;
        var path = document.path ? document.path : document.uri.path;
        var process = cprocess.spawn(syntaxRuntime, ["--map-errors", path.slice(1)]);
        process.stdout.on('data', (data) => {

            var keypress = () => {
                syntaxErrors.clear()
                var error = data.toString().split("*");
                var errorList = error.map((el, index) => isEven(index) && index != 0 ? false : [el.split("+")[1], error[index + 1].toString().trim().slice(1)]).filter(x=> x != false).filter(x => !isEmpty(x[0]) && !isEmpty(x[1]));
        
                if (errorList.length !== 0 && data.toString() != "no_error") {
                    for (error in errorList) {
                        var el = errorList[error];
                        var start = {
                            line: Number(el[0].toString().split(":")[0]),
                            colmn: Number(el[0].toString().split(":")[1]),
                        }
        
                        var end = {
                            line: Number(el[0].toString().split(":")[0]) - 1,
                            colmn: Number(el[0].toString().split(":")[1]),
                        }
        
                        start.line != 0 && start.line--
                        start.colmn != 0 && start.colmn--
                        end.line != 0 && end.line--
                        diagnostics.push(
                            new vscode.Diagnostic(
                                new vscode.Range(
                                    new vscode.Position(start.line, start.colmn), new vscode.Position(end.line, end.colmn)
                                ),
                                el[1],
                                vscode.DiagnosticSeverity.Error,
                            )
                        );
                    }
                    syntaxErrors.set(uri, diagnostics);
                } else {
                    console.log("Clean errors")
                }
            }
            keypressTimer && clearTimeout(keypressTimer);
            keypressTimer = setTimeout(keypress, keypressSlowdown)
        });
        process.on('error', (err) => {
            console.log(err)
        });
    }
}

async function requestMap(context, document) {
    if (vscode.workspace.getConfiguration("ellie").get("syntaxCheck")) {
        var q = (document.scheme == "untitled" || document.scheme == "file" || ((vscode.window.activeTextEditor?._documentData?._uri.scheme == "file" || vscode.window.activeTextEditor?._documentData?._uri.scheme == "untitled")))

        if (document && q && (document.languageId == "ellie" || vscode.window.activeTextEditor.document.languageId == "ellie") && !syntaxCheckDisabled) {
            if (!dowloadInProgress) {
                var targetDocument = document.languageId == "ellie" ? document : vscode.window.activeTextEditor.document;
                var inPath = await ellieInPath();
                if (inPath) {
                    map(context, targetDocument)
                    //()
                } else {
                    await downloadRequest();
                    map(context, targetDocument)
                }
            }
            
        };
    }
}

/**
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {
    vscode.languages.registerHoverProvider(
        { scheme: 'file', language: 'Ellie' },
        {
          provideHover(doc) {
              console.log("?");
            return new vscode.Hover('For new, unsaved TypeScript documents only');
          }
        }
      );
    
    //vscode.languages.registerCompletionItemProvider("ellie", )
    context.subscriptions.push(
        vscode.workspace.onDidChangeTextDocument(e => {
            requestMap(context, e.document.uri);
        }),
        vscode.workspace.onDidOpenTextDocument(e => {
            requestMap(context, e.uri);
        }),
        vscode.window.onDidChangeVisibleTextEditors(e => {
            requestMap(context, e[0]._documentData._uri);

        }),
    );
}
exports.activate = activate;
function deactivate() {}

module.exports = {
    activate,
    deactivate
};