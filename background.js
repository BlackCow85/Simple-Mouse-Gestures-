chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "closeTab") {
    if (sender.tab) {
      chrome.tabs.remove(sender.tab.id);
    }
  } else if (request.action === "reopenTab") {
    // 닫힌 탭 복구 (sessions 권한 필요)
    // 인자 없이 호출하면 가장 최근에 닫힌 세션(탭/창)을 복구합니다.
    chrome.sessions.restore();
  } else if (request.action === "refresh") {
    if (sender.tab) {
      chrome.tabs.reload(sender.tab.id);
    }
  }
});