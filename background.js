/* Copyright (C) 2016-2017 Chase
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 */


"use strict";

/* global chrome */
var browser = chrome;

var activeTabs = {};
const ICON_PATH_MAP = {
  "16": "/img/icon_16.svg",
  "32": "/img/icon_32.svg",
  "48": "/img/icon_48.svg",
  "64": "/img/icon_64.svg",
  "128": "/img/icon_128.svg"
};
const ICON_ACTIVE_PATH_MAP = {
  "16": "/img/icon_active_16.svg",
  "32": "/img/icon_active_32.svg",
  "48": "/img/icon_active_48.svg",
  "64": "/img/icon_active_64.svg",
  "128": "/img/icon_active_128.svg"
};

const MessageCommands = Object.freeze({
  "DISABLE": "disable",
  "DISCONNECT": "disconnect",
  "DISPLAY": "display",
  "NOTIFY": "notify",
  "UPDATE_CANVASES": "update-canvases"
});

const NOTIFICATION_DURATION = 10000;
var notifications = [];

function nullifyError() {
  if (browser.runtime.lastError) {
    // eslint-disable-line no-empty
  }
}

browser.browserAction.setIcon({"path": ICON_PATH_MAP}, nullifyError);

/* New browser version support runtime.onInstalled */
function handleInstall(details) {
  var reason = details.reason;
  switch (reason) {
    case "install":
      var obj = {"maxVideoSize": 524288000, "firstInstall": true};
      browser.storage.local.set(obj);
    break;
  }
}

/* Fallback for older browser versions first install */
function getFirstInstallSetting(setting) {
  if (Array.isArray(setting)) {
    setting = setting[0];
  }
  if (browser.runtime.lastError || !("firstInstall" in setting)) {
    handleInstall({"reason": "install"});
  }
}

if ("onInstalled" in browser.runtime) {
  browser.runtime.onInstalled.addListener(handleInstall);
} else {
  let firstInstallSetting = browser.storage.local.get("firstInstall", getFirstInstallSetting);
  if (firstInstallSetting) {
    firstInstallSetting.then(getFirstInstallSetting);
  }
}

function connected(port) {
  port.onMessage.addListener(onMessage);

  var queryTab = browser.tabs.query({"active": true}, getTabInfo);
  if (queryTab) {
    queryTab.then(getTabInfo);
  }
  function getTabInfo(tabs) {
    var tab = tabs[0];
    var tabId = tab.id;
    var frame = {"frameId": port.name, "port": port};
    activeTabs[tabId].frames.push(frame);
    port.onDisconnect.addListener(function() {
      onDisconnectTab({"command": MessageCommands.DISCONNECT, "tabId": tabId, "frameId": port.name});
    });
    port.postMessage({
      "command": MessageCommands.DISPLAY,
      "tabId": tabId
    });
  }
}
browser.runtime.onConnect.addListener(connected);

function onMessage(msg) {
  if (msg.command === MessageCommands.NOTIFY) {
    onTabNotify(msg);
  } else if (msg.command === MessageCommands.DISCONNECT) {
    onDisconnectTab(msg);
  }
}

function onTabNotify(msg) {
  var notifyId = msg.notification;
  var notifyOpts = {
    "type": "basic",
    "message": msg.notification,
    "title": "Capture Canvas",
    "iconUrl": ICON_ACTIVE_PATH_MAP["32"]
  };

  for (let k = 0, n = notifications.length; k < n; k += 1) {
    let notify = notifications[k];
    if (notify.message === notifyOpts.message) {
      return;
    }
  }
  notifications.push(notifyOpts);

  browser.notifications.create(notifyId, notifyOpts);
  setTimeout(() => {
    browser.notifications.clear(notifyId);
    for (let k = 0, n = notifications.length; k < n; k += 1) {
      let notify = notifications[k];
      if (notify.message === notifyOpts.message) {
        notifications.splice(k, 1);
      }
    }
  }, NOTIFICATION_DURATION);
}

function onDisconnectTab(msg) {
  var tabId = msg.tabId;
  if (tabId in activeTabs) {
    delete activeTabs[tabId];
  }
  browser.browserAction.setIcon({"path": ICON_PATH_MAP, "tabId": tabId}, nullifyError);
}

function onBrowserAction(tab) {
  var tabId = tab.id;

  if (tabId in activeTabs) {
    var topFrame = activeTabs[tabId].frames.find((el) => el.frameId === "top");
    topFrame.port.postMessage({
      "command": MessageCommands.DISABLE,
      "tabId": tabId
    });
    delete activeTabs[tabId];
    browser.browserAction.setIcon({"path": ICON_PATH_MAP, "tabId": tabId}, nullifyError);
  } else {
    browser.tabs.executeScript({
      "file": "/capture/capture.js",
      "allFrames": true
    });
    activeTabs[tabId] = {"frames": [], "tabId": tabId};
    browser.browserAction.setIcon({"path": ICON_ACTIVE_PATH_MAP, "tabId": tabId}, nullifyError);
  }
}
browser.browserAction.onClicked.addListener(onBrowserAction);
