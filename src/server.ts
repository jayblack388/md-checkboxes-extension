import * as vscode from 'vscode';
import express from 'express';
import { randomUUID, timingSafeEqual } from 'crypto';
import type { AddressInfo } from 'net';

export interface ServerInfo {
  port: number;
  nonce: string;
  dispose: () => void;
}

// Track the last active markdown document URI
let lastMarkdownUri: vscode.Uri | null = null;

export function setLastMarkdownUri(uri: vscode.Uri): void {
  lastMarkdownUri = uri;
}

export function createServer(): ServerInfo {
  const app = express();
  const nonce = randomUUID();

  app.get('/checkbox/mark', async (req, res) => {
    const { source, line, checked, nonce: requestNonce } = req.query;

    // Validate nonce with timing-safe comparison
    if (
      typeof requestNonce !== 'string' ||
      requestNonce.length !== nonce.length ||
      !timingSafeEqual(Buffer.from(nonce), Buffer.from(requestNonce))
    ) {
      res.status(403).send('Forbidden');
      return;
    }

    if (typeof source !== 'string' || typeof line !== 'string') {
      res.status(400).send('Bad request');
      return;
    }

    const lineNum = parseInt(line, 10);
    const isChecked = checked === 'true';

    try {
      await markCheckbox(source, lineNum, isChecked);
    } catch (err) {
      console.error('md-checkboxes: Error marking checkbox', err);
    }

    // Return a minimal transparent 1x1 PNG
    const pixel = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
      'base64'
    );
    res.set('Content-Type', 'image/png');
    res.set('Cache-Control', 'no-store');
    res.send(pixel);
  });

  const server = app.listen();
  const port = (server.address() as AddressInfo).port;

  return {
    port,
    nonce,
    dispose: () => server.close()
  };
}

async function markCheckbox(source: string, line: number, checked: boolean): Promise<void> {
  let uri: vscode.Uri;
  
  if (source) {
    uri = vscode.Uri.parse(source);
  } else {
    // Fallback chain: active editor -> visible editors -> tracked last markdown -> any open markdown
    const activeEditor = vscode.window.activeTextEditor;
    if (activeEditor && activeEditor.document.languageId === 'markdown') {
      uri = activeEditor.document.uri;
    } else {
      // Try to find any visible markdown editor
      const markdownEditor = vscode.window.visibleTextEditors.find(
        e => e.document.languageId === 'markdown'
      );
      if (markdownEditor) {
        uri = markdownEditor.document.uri;
      } else if (lastMarkdownUri) {
        // Use the last tracked markdown document
        uri = lastMarkdownUri;
      } else {
        // Last resort: find any open markdown document
        const markdownDoc = vscode.workspace.textDocuments.find(
          d => d.languageId === 'markdown'
        );
        if (!markdownDoc) {
          return;
        }
        uri = markdownDoc.uri;
      }
    }
  }
  
  // Open document (this is what VS Code uses for the preview)
  const doc = await vscode.workspace.openTextDocument(uri);
  
  // line is 1-based from the data-line attribute, convert to 0-based
  const lineIndex = line - 1;
  if (lineIndex < 0 || lineIndex >= doc.lineCount) {
    console.error('md-checkboxes: Line index out of bounds:', lineIndex);
    return;
  }
  
  const lineObj = doc.lineAt(lineIndex);
  const text = lineObj.text;

  // Match checkbox pattern: [x], [X], or [ ]
  const checkboxMatch = text.match(/\[[ xX]\]/);
  if (!checkboxMatch) {
    return;
  }

  const newChar = checked ? 'x' : ' ';
  const newText = text.replace(/\[[ xX]\]/, `[${newChar}]`);
  
  // Single atomic edit
  const edit = new vscode.WorkspaceEdit();
  edit.replace(uri, lineObj.range, newText);
  
  const success = await vscode.workspace.applyEdit(edit);
  
  if (!success) {
    return;
  }
  
  await doc.save();
}
