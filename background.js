chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  const tabId = sender.tab ? sender.tab.id : null;
  if (!tabId) return;

  // 네비게이션 및 탭 관리만 수행
  if (request.action === "goBack") {
    chrome.tabs.goBack(tabId).catch(() => {});
  }
  else if (request.action === "goForward") {
    chrome.tabs.goForward(tabId).catch(() => {});
  }
  else if (request.action === "refresh") {
    chrome.tabs.reload(tabId);
  }
  else if (request.action === "closeTab") {
    chrome.tabs.remove(tabId);
  }
  else if (request.action === "reopenTab") {
    chrome.sessions.restore();
  }
  // 스크롤 관련 명령은 제거됨 (content.js에서 직접 처리)
});