const vscode = require("vscode");

class EllieSyntaxWarns {
  constructor(items) {
    this.warns = [];
    this.items = items || [];
  }

  check() {
    for (var i = 0; i < this.items.length; i++) {
      var item = Object.values(this.items[i])[0];
      if (Object.keys(this.items[i])[0] == "Import") {
        if (item.pri_keyword) {
          this.warns.push(
            new vscode.Diagnostic(
              new vscode.Range(
                new vscode.Position(
                  item.pos.range_start[0],
                  item.pos.range_start[1]
                ),
                new vscode.Position(
                  item.pos.range_start[0],
                  item.pos.range_start[1] + 3
                )
              ),
              `Imports are private in default`,
              vscode.DiagnosticSeverity.Information
            )
          );
        }

        if (["string", "array", "char", "int", "void", "enumerate"].includes(item.path)) {
            this.warns.push(
            new vscode.Diagnostic(
              new vscode.Range(
                new vscode.Position(
                  item.path_pos.range_start[0],
                  item.path_pos.range_start[1]
                ),
                new vscode.Position(
                  item.pos.range_end[0],
                  item.pos.range_end[1]
                )
              ),
              `Ellie std library contains generics by default, Use ellie instead`,
              vscode.DiagnosticSeverity.Information
            )
          );
        }
        
      }
    }

    return this.warns;
  }
}

module.exports = EllieSyntaxWarns;
