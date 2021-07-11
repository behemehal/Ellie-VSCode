const vscode = require("vscode");
const process = require("process");
const childProcess = require("child_process");

const fs = require("fs");

var lib = {
  isEmpty: (x) => {
    return x == undefined || x == null || x == "" || x == " ";
  },
  resolveElliePath: (type) => {
    if (type == 0) {
      return (
        process.env.Path.split(isNt ? ";" : "").find((x) =>
          x.includes("ellie.exe")
        ) + "\\bin\\ellie.exe"
      );
    } else {
      return vscode.workspace.getConfiguration("ellie").get("serverLocation");
    }
  },

  workingEllieFound: (type) => {
    if (type == 0) {
      return fs.existsSync(lib.resolveElliePath(type));
    } else if (type == 1) {
      return fs.existsSync(lib.resolveElliePath(type));
    }
  },

  ellieIsEnv: () => {
    var isNt = os.type() == "Windows_NT";
    process.env.Path.split(isNt ? ";" : "").find((x) => x.includes("ellie"));
  },

  whichType: () => {
    if (
      typeof vscode.workspace.getConfiguration("ellie").get("serverLocation") ==
        "string" &&
      vscode.workspace.getConfiguration("ellie").get("serverLocation") != ""
    ) {
      return 1;
    } else {
      lib.ellieIsEnv() ? 0 : -1;
    }
  },
  whichLineEnding: (source) => {
    var temp = source.indexOf("\n");
    if (source[temp - 1] === "\r") return "\r\n";
    return "\n";
  },
  runCommand: async (serverPath, args) => {
    return new Promise((resolve, reject) => {
      childProcess.exec(
        serverPath + " " + args.join(" "),
        (error, stdout, stderr) => {
          resolve(stderr != "" ? stderr : stdout);
        }
      );
    });
  },
};
module.exports = lib;
