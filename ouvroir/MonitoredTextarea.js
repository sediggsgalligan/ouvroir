// MonitoredTextarea.js

export function createMonitoredTextarea({ containerEl, onLogChange }) {
  const wrapper = document.createElement('div');
  wrapper.style.display = 'flex';
  wrapper.style.flexDirection = 'column';
  wrapper.style.gap = '10px';

  const textarea = document.createElement('textarea');
  textarea.placeholder = "Type, delete, or paste here to generate history logs...";
  textarea.style.fontFamily = 'monospace';
  textarea.style.fontSize = '16px';
  textarea.style.minHeight = '150px';
  textarea.style.padding = '10px';
  textarea.style.borderRadius = '6px';
  textarea.style.border = '1px solid #ccc';
  textarea.style.width = '100%';
  textarea.style.boxSizing = 'border-box';

  const logContainer = document.createElement('div');
  logContainer.style.background = '#f5f5f5';
  logContainer.style.padding = '10px';
  logContainer.style.borderRadius = '4px';
  logContainer.style.fontSize = '12px';
  logContainer.innerHTML = '<strong>Live Delta Stream Log:</strong><pre style="margin:5px 0 0 0; white-space:pre-wrap; color:#fff;">[]</pre>';
  const logPre = logContainer.querySelector('pre');

  let history = [];
  let lastState = { text: '', selectionStart: 0, selectionEnd: 0 };

  textarea.addEventListener('keydown', (e) => {
    lastState = {
      text: e.target.value,
      selectionStart: e.target.selectionStart,
      selectionEnd: e.target.selectionEnd
    };
  });

  textarea.addEventListener('input', (e) => {
    const nextText = e.target.value;
    const currentCursor = e.target.selectionStart;
    let operation = '';
    let idx = lastState.selectionStart;

    if (nextText.length < lastState.text.length) {
      const deletedCount = lastState.text.length - nextText.length;
      if (deletedCount === 1 && lastState.selectionStart === lastState.selectionEnd) {
        if (currentCursor < lastState.selectionStart) {
          operation = "backspace";
          idx = currentCursor;
        } else {
          operation = "delete";
          idx = lastState.selectionStart;
        }
      } else {
        operation = `deleted_range(${lastState.selectionStart}-${lastState.selectionEnd})`;
      }
    } else if (nextText.length > lastState.text.length) {
      const addedText = nextText.slice(lastState.selectionStart, currentCursor);
      operation = addedText.length === 1 ? addedText : `paste("${addedText}")`;
    } else {
      operation = "mutation_replaced";
    }

    const logEntry = [idx, operation];
    history.push(logEntry);
    logPre.textContent = JSON.stringify(history);

    if (onLogChange) {
      onLogChange(history, nextText, currentCursor);
    }
  });

  wrapper.appendChild(textarea);
  wrapper.appendChild(logContainer);
  containerEl.appendChild(wrapper);

  return {
    clear: () => {
      history = [];
      textarea.value = '';
      logPre.textContent = '[]';
    }
  };
}