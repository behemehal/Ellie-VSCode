const vscode = require("vscode");

var decorated = false;

function decorate(activeEditor) {
  const lineRegEx = /(.\/)+.+(\d)/g;
  const hashRegEx = /((\^| \B)+.+( :\W))/g;

  const text = activeEditor.document.getText();
  const hash = [];
  const line = [];

  if (decorated) {
    return false;
  } else {
    decorated = true
  }

  let match;
  const lineDec = vscode.window.createTextEditorDecorationType({
    overviewRulerColor: "orange",
    color: "orange",
    overviewRulerLane: vscode.OverviewRulerLane.Right,
    light: {
      borderColor: "darkblue",
    },
    dark: {
      borderColor: "lightblue",
    },
  });

  const hashDec = vscode.window.createTextEditorDecorationType({
    color: "red",
    backgroundColor: { id: "ellie.largeNumberBackground" },
  });

  while ((match = lineRegEx.exec(text))) {
    const startPos = activeEditor.document.positionAt(match.index);
    const endPos = activeEditor.document.positionAt(
      match.index + match[0].length
    );
    const decoration = {
      range: new vscode.Range(startPos, endPos),
      hoverMessage: "Path: **" + match[0] + "**",
    };
    line.push(decoration);
  }

  while ((match = hashRegEx.exec(text))) {
    const startPos = activeEditor.document.positionAt(match.index);
    const endPos = activeEditor.document.positionAt(
      match.index + match[0].length
    );
    const decoration = {
      range: new vscode.Range(startPos, endPos),
      hoverMessage: "Code: " + match[0],
    };
    hash.push(decoration);
  }

  activeEditor.setDecorations(lineDec, line);
  activeEditor.setDecorations(hashDec, hash);
}

module.exports = decorate;
