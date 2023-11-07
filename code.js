"use strict";
// This file holds the main code for plugins. Code in this file has access to
// the *figma document* via the figma global object.
// You can access browser APIs in the <script> tag inside "ui.html" which has a
// full browser environment (See https://www.figma.com/plugin-docs/how-plugins-run).
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var MessageType;
(function (MessageType) {
    MessageType["setup"] = "setup";
    MessageType["items"] = "items";
    MessageType["languages"] = "languages";
})(MessageType || (MessageType = {}));
// Skip over invisible nodes and their descendants inside instances
// for faster performance.
figma.skipInvisibleInstanceChildren = true;
var credentials = undefined;
var nodes = {};
var languageCode = 'en';
// Runs this code if the plugin is run in Figma
if (figma.editorType === 'figma') {
    // This plugin will open a window to prompt the user to enter a number, and
    // it will then create that many rectangles on the screen.
    // This shows the HTML page in "ui.html".
    figma.showUI(__html__, { width: 600, height: 320 });
    load();
    // Calls to "parent.postMessage" from within the HTML page will trigger this
    // callback. The callback will be passed the "pluginMessage" property of the
    // posted message.
    figma.ui.onmessage = msg => {
        // One way of distinguishing between different types of messages sent from
        // your HTML page is to use an object with a "type" property like this.
        switch (msg.type) {
            case 'connect':
                if (msg.message.host && msg.message.token) {
                    var port = '8000';
                    if (msg.message.port) {
                        port = msg.message.port;
                    }
                    if (credentials) {
                        credentials.host = msg.message.host;
                        credentials.token = msg.message.token;
                        credentials.port = port;
                    }
                    else {
                        credentials = {
                            host: msg.message.host,
                            token: msg.message.token,
                            port: port
                        };
                    }
                    storeCreds();
                    fetchTextNodesFromSelection();
                }
                else {
                    sendError("Provide host and access token");
                }
                break;
            case 'refresh':
                fetchTextNodesFromSelection();
                break;
            case 'push':
                push(msg.selected);
                break;
            case 'pull':
                pull(msg.selected);
                break;
            case 'apply':
                applyChanges();
                break;
            case 'cancel':
                figma.closePlugin();
                break;
            case 'language':
                languageCode = msg.value;
                break;
            case 'logout':
                logout();
                break;
        }
    };
}
function send(type, data) {
    figma.ui.postMessage({ type: type, content: data });
}
function sendError(data) {
    figma.ui.postMessage({ type: 'error', content: data });
}
function fetchTextNodesFromSelection() {
    var textNodes = {};
    for (const node of figma.currentPage.selection) {
        const nodes = getTextNodesFrom(node, []);
        for (const elm of nodes) {
            if (elm.type === "TEXT") {
                textNodes[elm.name] = {
                    translation: elm.characters,
                    selected: false
                };
            }
        }
    }
    nodes = textNodes;
    send(MessageType.items, textNodes);
}
function getTextNodesFrom(node, textNodes) {
    if ('children' in node) {
        for (const child of node.children) {
            const subnodes = getTextNodesFrom(child, textNodes);
            textNodes.concat(subnodes);
        }
    }
    if (node.type === "TEXT") {
        textNodes.push(node);
    }
    return textNodes;
}
function updateSelectedNodes(data) {
    for (const item of data) {
        nodes[item.token].translation = item.translation;
    }
    send(MessageType.items, nodes);
}
function applyChanges() {
    for (const selection of figma.currentPage.selection) {
        for (const item in nodes) {
            updateTextChild(selection, item, nodes[item].translation);
        }
    }
}
function updateTextChild(node, name, value) {
    return __awaiter(this, void 0, void 0, function* () {
        if (node.type === 'TEXT' && node.name === name) {
            const missingFonts = node.getRangeAllFontNames(0, node.characters.length);
            for (const font of missingFonts) {
                yield figma.loadFontAsync(font);
            }
            node.autoRename = false;
            node.characters = value;
        }
        if ('children' in node) {
            for (const child of node.children) {
                updateTextChild(child, name, value);
            }
        }
    });
}
// Network
function pull(items) {
    return __awaiter(this, void 0, void 0, function* () {
        if (!credentials) {
            return;
        }
        for (const item of items) {
            nodes[item].selected = true;
        }
        const data = {
            code: languageCode,
            tokens: items
        };
        fetch(`${credentials.host}:${credentials.port}/api/plugin/pull`, {
            method: "POST",
            headers: headers(),
            body: JSON.stringify(data),
        })
            .then((response) => {
            if (response.ok) {
                return response.json();
            }
            return Promise.reject(response);
        })
            .then((response) => updateSelectedNodes(response))
            .catch((error) => error.json().then((json) => sendError(json.error)));
    });
}
function push(items) {
    return __awaiter(this, void 0, void 0, function* () {
        if (!credentials) {
            return;
        }
        var translations = [];
        for (const item of items) {
            translations.push({
                token: item,
                translation: nodes[item].translation
            });
        }
        const data = {
            code: languageCode,
            translations: translations
        };
        fetch(`${credentials.host}:${credentials.port}/api/plugin/push`, {
            method: "POST",
            headers: headers(),
            body: JSON.stringify(data),
        })
            .then((response) => {
            if (response.ok) {
                return response.json();
            }
            return Promise.reject(response);
        })
            .then((response) => console.log(JSON.stringify(response)))
            .catch((error) => error.json().then((json) => sendError(json.error)));
    });
}
function fetchLanguages() {
    return __awaiter(this, void 0, void 0, function* () {
        if (!credentials) {
            sendError("No creds");
            return;
        }
        fetch(`${credentials.host}:${credentials.port}/api/plugin/languages`, {
            method: "GET",
            headers: headers(),
            redirect: 'follow',
        })
            .then((response) => {
            if (response.ok) {
                return response.json();
            }
            return Promise.reject(response);
        })
            .then((response) => {
            if (response && response) {
                languageCode = response[0];
            }
            send(MessageType.languages, response);
        })
            .catch((error) => error.json().then((json) => sendError(json.error)));
    });
}
function headers() {
    if (credentials) {
        return {
            'Access-Token': credentials.token,
            'User-Agent': 'figma',
            'Host': credentials.host,
            'Content-Type': 'application/json'
        };
    }
    return {};
}
// Storage
function load() {
    figma.clientStorage.getAsync('strings_repository_credentials')
        .then((creds) => {
        if (creds) {
            credentials = creds;
            fetchTextNodesFromSelection();
            fetchLanguages();
        }
        else {
            send(MessageType.setup, {});
        }
    })
        .catch(error => {
        send(MessageType.setup, {});
    });
}
function storeCreds() {
    figma.clientStorage.setAsync('strings_repository_credentials', credentials);
}
function logout() {
    figma.clientStorage.deleteAsync('strings_repository_credentials');
    send(MessageType.setup, {});
}
