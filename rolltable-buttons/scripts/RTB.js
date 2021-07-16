class RTB extends Application {
    constructor(options = {}) {
        super(options);
    }

    _openDialog() {
        RTB.openDialog();
    }
    /**
     * Opens dialog menu for selecting roll tables
     *
     * @returns
     * @memberof RTB
     */
    static openDialog(folder = null) {
        let templateData = { data: [] };
        let templatePath =
            "modules/rolltable-buttons/templates/rolltable-menu.html";

        let dialog = document.querySelectorAll(".RTB-window");
        if (dialog.length > 0) {
            dialog.forEach(function (container) {
                container.remove();
            });
        }

        templateData = RTB.fetch_dialog_list(templateData, folder);
        RTB.renderMenu(templatePath, templateData);
    }
    /**
     * Generate list of objects to display in Dialog
     *
     * @param {String} selectedFolder
     * @returns {Array}
     */
    static fetch_dialog_list(templateData, selectedFolder) {

        let hasPermission = (table) =>
            table.data.permission[game.user.id] >=
                CONST.ENTITY_PERMISSIONS.OBSERVER ||
            table.data.permission.default >=
                CONST.ENTITY_PERMISSIONS.OBSERVER ||
            game.user.isGM;

        const tables = game.tables.filter(
            (table) =>
                table.data.displayRoll &&
                table.folder == selectedFolder &&
                hasPermission(table)
        );
        const folders = game.folders.filter(
            (folder) =>
                folder.data.type == "RollTable" &&
                folder.parent == selectedFolder &&
                folder.content.some((el) => hasPermission(el))
        );
        tables.forEach(function (table) {
            templateData.data.push({ name: table.data.name, isFolder: false, data: table.data, ...table });
        });
        folders.forEach(function (folder) {
            templateData.data.push({ name: folder.data.name, isFolder: true, data: folder.data, ...folder });
        });
        return templateData;
    }

    /**
     * Render dialog menu with input data
     *
     * @static
     * @param {String} path
     * @param {Object} data
     * @memberof RTB
     */
    static renderMenu(path, data) {
        const dialogOptions = {
            width: 200,
            top: event.clientY - 80,
            left: window.innerWidth - 510,
            classes: ["RTB-window"],
        };
        renderTemplate(path, data).then((dlg) => {
            new Dialog(
                {
                    title: game.i18n.localize("RTB.DialogTitle"),
                    content: dlg,
                    buttons: {},
                },
                dialogOptions
            ).render(true);
        });
    }

    /**
     * Convenience function for stripping HTML tags from input string
     *
     * @static
     * @param {String} html
     * @returns
     * @memberof RTB
     */
    static _removeHTMLTags(html) {
        const div = document.createElement("div");
        div.innerHTML = html;
        return div.textContent || div.innerText || "";
    }

    /**
     * Finds and rolls input roll table, then outputs to chat according to type of outcome
     *
     * @static
     * @param {String} rollTableName
     * @returns
     * @memberof RTB
     */
    static async draw(rollTableName) {
        const rollTable = game.tables.entities.find(
            (b) => b.name === rollTableName
        );
        if (rollTable.data.results.length == 0) {
            return;
        }

        if (rollTable.data.results.length == 1) {
            const r = rollTable.roll();
            const result = r.results[0];
            const roll = r.roll;
            const tableName = rollTable.data.name;
            let outcomeName = null;
            let outcomeContent = null;
            if (
                result.type === CONST.TABLE_RESULT_TYPES.ENTITY &&
                result.collection === "JournalEntry"
            ) {
                outcomeName = RTB._removeHTMLTags(result.text);
                outcomeContent = game.journal.entities.find(
                    (b) => b._id === result.resultId
                ).data.content;
                outcomeContent = RTB._removeHTMLTags(outcomeContent);
                RTB._addChatMessage(
                    tableName,
                    outcomeName,
                    outcomeContent
                ).then();
            } else {
                let rollMode = game.settings.get("core", "rollMode");
                rollTable.draw({
                    roll: roll,
                    results: [result],
                    displayChat: rollTable.data.displayRoll,
                    rollMode: rollMode,
                });
            }
            return result;
        } else {
            const r = await rollTable.roll();
            rollTable.toMessage(r.results, r);
        }
    }

    /**
     * Outputs roll table parameters to chat
     *
     * @static
     * @param {String} tableName
     * @param {String} outcomeName
     * @param {String} outcomeContent
     * @memberof RTB
     */
    static async _addChatMessage(tableName, outcomeName, outcomeContent) {
        let content = await renderTemplate(
            "modules/rolltable-buttons/templates/chat-card.html",
            {
                tableName: tableName,
                outcomeName: outcomeName,
                outcomeContent: outcomeContent,
            }
        );
        let speaker = ChatMessage.getSpeaker({ user: game.user });
        let chatData = {
            user: game.user._id,
            content: content,
            type: CONST.CHAT_MESSAGE_TYPES.OTHER,
            sound: CONFIG.sounds.dice,
            speaker: speaker,
        };
        let rollMode = game.settings.get("core", "rollMode");
        if (["gmroll", "blindroll"].includes(rollMode))
            chatData["whisper"] = ChatMessage.getWhisperIDs("GM");
        if (rollMode === "blindroll") chatData["blind"] = true;

        await ChatMessage.create(chatData, {});
    }

    /**
     * Open Folder to get RollTables within
     *
     * @static
     * @param {Object} data
     * @memberof RTB
     */
    static _openFolder(folder) {
        folder = game.folders.filter((x) => x.id == folder.data._id)[0];
        RTB.openDialog(folder);
    }
}

class RTBControl {
    /**
     * Adds button to chat controls and sets button functionality
     *
     * @memberof RTB
     */
    static addChatControl() {
        let chatControl = document.getElementById("chat-controls");
        let tableNode = document.getElementById("RTB-button");

        if (chatControl && !tableNode) {
            tableNode = document.createElement("label");
            tableNode.setAttribute("class", "RTB-control-icon");
            tableNode.innerHTML = `<i id="RTB-button" class="fas fa-bullseye"></i>`;
            tableNode.onclick = RTBControl.initializeRTB;

            chatControl.insertBefore(tableNode, chatControl.childNodes[2]);
        }
    }

    static initializeRTB() {
        if (this.rtb === undefined) {
            this.rtb = new RTB();
        }
        this.rtb._openDialog();
    }
}

Handlebars.registerHelper("json", function (context) {
    return JSON.stringify(context);
});

Hooks.on("renderChatLog", RTBControl.addChatControl);
