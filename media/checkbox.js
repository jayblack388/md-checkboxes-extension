(function () {
  // Prevent double initialization
  if (window.__mdCheckboxesInit) {
    return;
  }
  window.__mdCheckboxesInit = true;

  // Storage key for checkbox states
  const STORAGE_KEY = 'md-checkboxes-state';

  // Save checkbox state to localStorage
  function saveCheckboxState(line, checked) {
    try {
      const states = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
      states[line] = checked;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(states));
    } catch (e) {
      // Ignore storage errors
    }
  }

  // Restore checkbox states from localStorage
  function restoreCheckboxStates() {
    try {
      const states = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
      
      document.querySelectorAll('[data-line]').forEach(el => {
        const line = el.dataset.line;
        if (line && states.hasOwnProperty(line)) {
          const checkbox = el.querySelector('input[type="checkbox"]');
          if (checkbox && checkbox.checked !== states[line]) {
            checkbox.checked = states[line];
          }
        }
      });
    } catch (e) {
      // Ignore storage errors
    }
  }

  // When page becomes visible, restore checkbox states
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      setTimeout(restoreCheckboxStates, 50);
    }
  });

  // Also restore on focus
  window.addEventListener('focus', () => {
    setTimeout(restoreCheckboxStates, 50);
  });

  // Initial restore
  setTimeout(restoreCheckboxStates, 100);

  document.addEventListener('click', (e) => {
    // Only handle checkbox clicks
    if (!(e.target instanceof HTMLInputElement) || e.target.type !== 'checkbox') {
      return;
    }

    const checkbox = e.target;
    const checkboxData = getCheckboxData(checkbox);
    if (!checkboxData) {
      return;
    }

    const serverData = getServerData();
    if (!serverData) {
      return;
    }

    const source = getSource(serverData);

    sendRequest(serverData.port, serverData.nonce, source || '', checkboxData.line, checkboxData.checked);
    
    // Save state to localStorage for restoration on tab switch
    saveCheckboxState(checkboxData.line, checkboxData.checked);
  });

  function getCheckboxData(target) {
    if (!(target instanceof HTMLInputElement) || target.type !== 'checkbox') {
      return null;
    }

    // Find the parent element with data-line attribute
    let parent = target.parentElement;
    while (parent) {
      if (parent.dataset && parent.dataset.line !== undefined) {
        return {
          line: parseInt(parent.dataset.line, 10),
          checked: target.checked
        };
      }
      parent = parent.parentElement;
    }

    return null;
  }

  function getServerData() {
    const el = document.getElementById('mdCheckboxServerData');
    if (!el) return null;

    const port = el.dataset.port;
    const nonce = el.dataset.nonce;
    const source = el.dataset.source;

    if (!port || !nonce) return null;

    return { port, nonce, source };
  }

  function getSource(serverData) {
    // First try to get source from the server data div
    if (serverData && serverData.source) {
      return serverData.source;
    }

    // Fallback: try VS Code's meta tag
    const meta = document.querySelector('meta[name="vscode-markdown-preview-data"]');
    if (!meta) return null;

    try {
      const content = meta.getAttribute('content');
      if (!content) return null;
      const data = JSON.parse(content);
      return data.source;
    } catch {
      return null;
    }
  }

  function sendRequest(port, nonce, source, line, checked) {
    // Use an invisible image request to bypass CORS restrictions
    const img = document.createElement('img');
    img.style.display = 'none';
    img.src = `http://127.0.0.1:${port}/checkbox/mark?` +
      `source=${encodeURIComponent(source)}` +
      `&line=${line}` +
      `&checked=${checked}` +
      `&nonce=${encodeURIComponent(nonce)}` +
      `&_=${crypto.randomUUID()}`; // Cache buster

    document.body.appendChild(img);
    img.onload = img.onerror = () => img.remove();
  }
})();
