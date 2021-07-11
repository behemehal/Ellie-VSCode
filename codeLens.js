const vscode = require("vscode");

var lensed = false;

class CodeLensProvider {
  provideCodeLenses(doc, token) {
    if (doc.languageId != "EllieDebugHeaders") {
      return false;
    }
    const regex = new RegExp(/((\| \B)+.+( :\W))/g);
    var codeLenses = [];
    const text = doc.getText();
    let matches;
    while ((matches = regex.exec(text)) !== null) {
      const line = doc.lineAt(doc.positionAt(matches.index).line);
      const indexOf = line.text.indexOf(matches[0]);
      const position = new vscode.Position(line.lineNumber, indexOf);
      const range = doc.getWordRangeAtPosition(position, new RegExp(regex));
      if (range) {
        codeLenses.push(new vscode.CodeLens(range));
      }
    }
    return codeLenses;
  }

  resolveCodeLens(codeLens, token) {
    codeLens.command = {
      title: "| Go to error defining",
      tooltip: "Follow error defining",
      command: "ellie.goToError",
      arguments: [{ start: codeLens.range._start, end: codeLens.range._start }],
    };
    return codeLens;
  }
}

module.exports = CodeLensProvider;
