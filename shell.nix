{ pkgs ? import <nixpkgs> {} }:

pkgs.mkShell {
  buildInputs = [
    pkgs.nodejs_22
  ];

  shellHook = ''
    echo "Node.js $(node --version) ready"
  '';
}
