// ==UserScript==
// @name         Returns List
// @namespace    http://tampermonkey.net/
// @version      1.0.0
// @description  For planning your returns route
// @match        *://www.menards.com/*
// @match        *://menards.com/*
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_addStyle
// @run-at       document-start
// ==/UserScript==

(function() {
    'use strict';

    // Below code is involved with automating opening the barcode scanner
    // ___________________________________________________________________

    // One attempt to start the scanner at a time

    let isStarting = false;

    function startScan() {
        if (isStarting) return;
        isStarting = true;

        // Checks if scanner modal is open regularly

        const isModal = setInterval(() => {
            const modal = document.querySelector('#barcodeScannerModal');
            if (!modal) {
                isStarting = false;
                clearInterval(isModal);
                return;
            }

            if (!modal.classList.contains('show')) {
                return;
            }

            // Selects the buttons of the scanner modals automatically.

            const continueBtn = modal.querySelector('button.btn-outline-primary, button.btn-primary');
            if (continueBtn && continueBtn.textContent.trim().toUpperCase() === 'CONTINUE') {
                continueBtn.click();
                return;
            }

            const startBtn = Array.from(modal.querySelectorAll('button.btn-success, button.btn-primary')).find(
                btn => btn.textContent.trim().toUpperCase().includes('START SCANNER')
            );
            if (startBtn) {
                startBtn.click();
                clearInterval(isModal);
                isStarting = false;
                return;
            }

            const greenBtn = modal.querySelector('button.btn-success');
            if (greenBtn && greenBtn.textContent.trim().toUpperCase().includes('START')) {
                greenBtn.click();
                clearInterval(isModal);
                isStarting = false;
            }
        }, 100);

        setTimeout(() => {
            clearInterval(isModal);
            isStarting = false;
        }, 10000);
    }

    // To detect the scanner being added to the page.

    function activeScanner() {
        const observer = new MutationObserver((mutations) => {
            for (const mutation of mutations) {
                if (mutation.target.id === 'barcodeScannerModal' ||
                    mutation.target.closest?.('#barcodeScannerModal')) {
                    startScan();
                    break;
                }

                for (const node of mutation.addedNodes) {
                    if (node.nodeType === Node.ELEMENT_NODE) {
                        if (node.id === 'barcodeScannerModal' ||
                            node.querySelector?.('#barcodeScannerModal') ||
                            node.classList?.contains('show')) {
                            startScan();
                            break;
                        }
                    }
                }
            }
        });

        if (document.body || document.documentElement) {
            observer.observe(document.body || document.documentElement, {
                childList: true,
                subtree: true,
                attributes: true,
                attributeFilter: ['class']
            });
        }
    }

    function CSSBootStrap() {
        const checkJQuery = setInterval(() => {
            const $ = window.jQuery;
            if (typeof $ !== 'undefined' && $ && $.fn && $.fn.modal) {
                clearInterval(checkJQuery);

                const originalModal = $.fn.modal;

                $.fn.modal = function(option) {
                    const result = originalModal.apply(this, arguments);

                    if (this.attr('id') === 'barcodeScannerModal' && option === 'show') {
                        setTimeout(startScan, 50);
                    }

                    return result;
                };
            }
        }, 100);

        setTimeout(() => clearInterval(checkJQuery), 30000);
    }

    function findScanButtons() {
        document.addEventListener('click', (e) => {
            const target = e.target.closest('[data-target="#barcodeScannerModal"], [data-bs-target="#barcodeScannerModal"]');
            if (target) {
                setTimeout(startScan, 100);
            }
        }, true);
    }

    // Below code is involved with storing data
    // ___________________________________________________________________

    // Stores the list of products
    const PRODUCT_KEY = "productList";
    // Whether the UI is minimized or not
    const STATE_KEY = "UIState";
    // Stores the user added notes
    const NOTES_KEY = "noteList";

    function loadList() {
        return GM_getValue(PRODUCT_KEY, []);
    }
    function saveList(list) {
        GM_setValue(PRODUCT_KEY, list);
    }

    function loadUIState() {
        return GM_getValue(STATE_KEY, { minimized: false });
    }
    function saveUIState(state) {
        GM_setValue(STATE_KEY, state);
    }

    function loadNotes() {
        return GM_getValue(NOTES_KEY, {});
    }
    function saveNotes(notes) {
        GM_setValue(NOTES_KEY, notes);
    }

    // For checking if the SKU has a note. 

    function getNote(sku) {
        const key = (sku || "").trim();
        if (!key) return "";
        const notes = loadNotes();
        return notes[key] || "";
    }
    function setNote(sku, note) {
        const key = (sku || "").trim();
        if (!key) return;
        const notes = loadNotes();
        if (note && note.trim()) {
            notes[key] = note.trim();
        } else {
            delete notes[key];
        }
        saveNotes(notes);
    }
    function clearAllNotes() {
        GM_setValue(NOTES_KEY, {});
    }
    function notesCount() {
        return Object.keys(loadNotes()).length;
    }

    // Below code is involved with collecting page data
    // ___________________________________________________________________

    function readProductData() {
        // search through "application/ld+json" for product details
        const scripts = Array.from(document.querySelectorAll('script[type="application/ld+json"]'));
        for (const s of scripts) {
            const txt = (s.textContent || "").trim();
            if (!txt) continue;

            try {
                const json = JSON.parse(txt);
                const candidates = Array.isArray(json) ? json : [json];

                for (const obj of candidates) {
                    if (!obj || typeof obj !== "object") continue;

                    // When on a product page
                    const type = obj["@type"] || obj.type;
                    if (type === "Product" || (Array.isArray(type) && type.includes("Product"))) {
                        const sku = obj.sku != null ? String(obj.sku).trim() : "";
                        const name = obj.name != null ? String(obj.name).trim() : "";
                        const url = obj.url ? String(obj.url).trim() : location.href;
                        let price = null;
                        if (obj.offers) {
                            const offers = Array.isArray(obj.offers) ? obj.offers : [obj.offers];
                            for (const offer of offers) {
                                if (offer && offer.price != null) {
                                    price = parseFloat(offer.price);
                                    if (!isNaN(price)) break;
                                }
                            }
                        }
                        
                        if (sku || name) return { sku, name, url, price };
                    }
                }
            } catch (e) {
            }
        }
        return null;
    }

    // looks for text with an aisle and section
    function AisleSection() {
        const bodyText = document.body ? document.body.innerText : "";
        if (!bodyText) return "";

        const re = /Item\s+Located\s+in\s+(Aisle\s+\d+\s*(?:Section\s*[A-Z0-9]+)?)/i;
        const m = bodyText.match(re);
        if (m && m[1]) {
            return m[1].replace(/\s+/g, " ").trim();
        }

        const re2 = /(Aisle\s+\d+\s*(?:Section\s*[A-Z0-9]+)?)/i;
        const m2 = bodyText.match(re2);
        if (m2 && m2[1]) return m2[1].replace(/\s+/g, " ").trim();

        return "";
    }

    function isProductPage(info) {
        if (info && info.sku) return true;
        return /\/\d+\/p-.*\.htm/i.test(location.href);
    }

    // Counts how many items scanned per aisle
    function getAisleCounts(list) {
        const counts = {};
        for (const item of list) {
            const aisle = item.aisle || "";
            const match = aisle.match(/Aisle\s+(\d+)/i);
            if (match && match[1]) {
                const aisleNum = match[1];
                counts[aisleNum] = (counts[aisleNum] || 0) + 1;
            } else if (aisle && !aisle.includes("not found")) {
                counts.Other = (counts.Other || 0) + 1;
            } else {
                counts.Unknown = (counts.Unknown || 0) + 1;
            }
        }
        return counts;
    }

    function searchAisle(aisleStr) {
        const aisleMatch = (aisleStr || "").match(/Aisle\s+(\d+)/i);
        const sectionMatch = (aisleStr || "").match(/Section\s*([A-Z0-9]+)/i);
        return {
            aisleNum: aisleMatch ? aisleMatch[1] : null,
            section: sectionMatch ? sectionMatch[1].toUpperCase() : null
        };
    }

    //CSS styles for the overlay

    function addPickListStyles() {
        GM_addStyle(`
            #mnPanel {
                position: fixed;
                right: 16px;
                bottom: 16px;
                width: 340px;
                max-height: 70vh;
                background: #111;
                color: #fff;
                font: 12px/1.35 system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif;
                border: 1px solid rgba(255,255,255,0.15);
                border-radius: 10px;
                box-shadow: 0 10px 30px rgba(0,0,0,0.35);
                z-index: 2147483647;
                overflow: hidden;
            }
            #mnPanelHeader {
                display: flex;
                align-items: center;
                justify-content: space-between;
                padding: 10px 10px 8px;
                background: #1b1b1b;
                border-bottom: 1px solid rgba(255,255,255,0.12);
                cursor: default;
                user-select: none;
            }
            #mnPanelHeader .title {
                font-weight: 700;
                font-size: 12px;
                letter-spacing: 0.2px;
            }
            #mnPanelHeader .btns {
                display: flex;
                gap: 6px;
                align-items: center;
            }
            #mnPanelHeader button,
            #mnPanelFooter button {
                background: #2c2c2c;
                color: #fff;
                border: 1px solid rgba(255,255,255,0.18);
                border-radius: 8px;
                padding: 6px 8px;
                font-size: 12px;
                cursor: pointer;
            }
            #mnPanelHeader button:hover,
            #mnPanelFooter button:hover { background: #3a3a3a; }
            #mnPanelContent {
                display: flex;
                max-height: calc(70vh - 96px);
            }
            #mnAisleSidebar {
                width: 70px;
                min-width: 70px;
                background: #1a1a1a;
                border-right: 1px solid rgba(255,255,255,0.10);
                padding: 8px 6px;
                overflow-y: auto;
                display: flex;
                flex-direction: column;
                gap: 4px;
            }
            #mnAisleSidebar .aisle-title {
                font-weight: 700;
                font-size: 10px;
                text-transform: uppercase;
                opacity: 0.6;
                margin-bottom: 4px;
                text-align: center;
            }
            #mnAisleSidebar .aisle-item {
                background: rgba(255,255,255,0.08);
                border-radius: 6px;
                padding: 5px 6px;
                text-align: center;
                font-size: 11px;
                font-weight: 600;
                cursor: pointer;
                transition: background 0.15s, transform 0.1s;
                border: 2px solid transparent;
            }
            #mnAisleSidebar .aisle-item:hover {
                background: rgba(255,255,255,0.15);
                transform: scale(1.02);
            }
            #mnAisleSidebar .aisle-item.selected {
                background: rgba(76, 175, 80, 0.3);
                border-color: #4CAF50;
            }
            #mnAisleSidebar .aisle-item .aisle-num {
                color: #8fd3ff;
            }
            #mnAisleSidebar .aisle-item.selected .aisle-num {
                color: #81C784;
            }
            #mnAisleSidebar .aisle-item .aisle-count {
                color: #ffc107;
            }
            #mnAisleSidebar .aisle-item.selected .aisle-count {
                color: #A5D6A7;
            }
            #mnAisleSidebar .no-aisles {
                font-size: 10px;
                opacity: 0.5;
                text-align: center;
                padding: 8px 4px;
            }
            #mnPanelBody {
                padding: 8px 10px;
                overflow: auto;
                flex: 1;
            }
            #mnPanelBody .empty {
                opacity: 0.75;
                padding: 10px 0;
            }
            .mnRow {
                display: grid;
                grid-template-columns: 1fr auto;
                gap: 8px;
                padding: 8px;
                border: 1px solid rgba(255,255,255,0.10);
                border-radius: 10px;
                margin-bottom: 8px;
                background: rgba(255,255,255,0.04);
                transition: background 0.2s, border-color 0.2s;
            }
            .mnRow.highlighted {
                background: rgba(76, 175, 80, 0.2);
                border-color: #4CAF50;
            }
            .mnRow .meta {
                display: flex;
                flex-direction: column;
                gap: 2px;
                min-width: 0;
            }
            .mnRow .name {
                font-weight: 650;
                word-break: break-word;
            }
            .mnRow .sub {
                opacity: 0.85;
                display: flex;
                flex-wrap: wrap;
                gap: 8px;
            }
            .mnRow a {
                color: #8fd3ff;
                text-decoration: none;
            }
            .mnRow a:hover { text-decoration: underline; }
            .mnRow .price {
                color: #81C784;
                font-weight: 600;
            }
            .mnRow .del {
                align-self: start;
                background: #3a1e1e;
                color: #ff8a80;
                border: 1px solid rgba(255,138,128,0.25);
                border-radius: 8px;
                padding: 4px 8px;
                font-size: 11px;
                cursor: pointer;
            }
            .mnRow .del:hover {
                background: #5a2a2a;
                border-color: rgba(255,255,255,0.18);
            }
            #mnPanelFooter {
                padding: 8px 10px 10px;
                background: #1b1b1b;
                border-top: 1px solid rgba(255,255,255,0.12);
                display: flex;
                gap: 8px;
                justify-content: space-between;
                align-items: center;
            }
            #mnPanelFooter .left, #mnPanelFooter .right {
                display: flex;
                gap: 8px;
                align-items: center;
            }
            #mnPanel.minimized #mnPanelContent,
            #mnPanel.minimized #mnPanelFooter {
                display: none;
            }
            .mnRow .notes-section {
                margin-top: 4px;
            }
            .mnRow .notes-display {
                display: flex;
                align-items: flex-start;
                gap: 6px;
            }
            .mnRow .note-text {
                color: #ffd54f;
                font-style: italic;
                font-size: 11px;
                flex: 1;
                word-break: break-word;
            }
            .mnRow .note-edit-btn {
                background: transparent;
                border: none;
                color: #8fd3ff;
                font-size: 10px;
                cursor: pointer;
                padding: 0;
                text-decoration: underline;
            }
            .mnRow .note-edit-btn:hover {
                color: #bbdefb;
            }
            .mnRow .notes-input-wrapper {
                display: flex;
                gap: 4px;
                align-items: center;
            }
            .mnRow .note-input {
                flex: 1;
                background: #2a2a2a;
                border: 1px solid rgba(255,255,255,0.2);
                border-radius: 4px;
                color: #fff;
                font-size: 11px;
                padding: 4px 6px;
                min-width: 0;
            }
            .mnRow .note-input:focus {
                outline: none;
                border-color: #4CAF50;
            }
            .mnRow .note-save-btn,
            .mnRow .note-cancel-btn {
                background: #2c2c2c;
                border: 1px solid rgba(255,255,255,0.18);
                border-radius: 4px;
                color: #fff;
                font-size: 10px;
                padding: 3px 6px;
                cursor: pointer;
            }
            .mnRow .note-save-btn:hover {
                background: #4CAF50;
            }
            .mnRow .note-cancel-btn:hover {
                background: #3a3a3a;
            }
            .mnRow .add-note-btn {
                background: transparent;
                border: 1px dashed rgba(255,255,255,0.3);
                border-radius: 4px;
                color: rgba(255,255,255,0.6);
                font-size: 10px;
                padding: 3px 8px;
                cursor: pointer;
                margin-top: 4px;
            }
            .mnRow .add-note-btn:hover {
                border-color: rgba(255,255,255,0.5);
                color: rgba(255,255,255,0.8);
            }
            #mnPanelFooter .clear-notes-btn {
                background: #2a2a1e;
                color: #ffd54f;
                border: 1px solid rgba(255,213,79,0.25);
            }
            #mnPanelFooter .clear-notes-btn:hover {
                background: #3a3a2a;
            }
        `);
    }

    // Below code is for building the overlay
    // ___________________________________________________________________

    
    function el(tag, attrs = {}, children = []) {
        const n = document.createElement(tag);
        Object.entries(attrs).forEach(([k, v]) => {
            if (k === "text") n.textContent = v;
            else if (k === "html") n.innerHTML = v;
            else n.setAttribute(k, v);
        });
        for (const c of children) n.appendChild(c);
        return n;
    }

    let panel, body, aisleSidebar;
    let selectedAisle = null;

    function render() {
        if (!panel) return;

        const list = loadList();
        body.innerHTML = "";
        aisleSidebar.innerHTML = "";

        const aisleCounts = getAisleCounts(list);
        const aisleEntries = Object.entries(aisleCounts);

        aisleEntries.sort((a, b) => {
            const aNum = parseInt(a[0], 10);
            const bNum = parseInt(b[0], 10);
            const aIsNum = !isNaN(aNum);
            const bIsNum = !isNaN(bNum);

            if (aIsNum && bIsNum) return aNum - bNum;
            if (aIsNum) return -1;
            if (bIsNum) return 1;
            if (a[0] === "Unknown") return 1;
            if (b[0] === "Unknown") return -1;
            return a[0].localeCompare(b[0]);
        });

        if (aisleEntries.length > 0) {
            aisleSidebar.appendChild(el("div", { class: "aisle-title", text: "Aisles" }));
            for (const [aisle, count] of aisleEntries) {
                const displayAisle = aisle === "Unknown" ? "?" : aisle;
                const aisleItem = el("div", {
                    class: "aisle-item" + (selectedAisle === aisle ? " selected" : ""),
                    html: `<span class="aisle-num">${escapeHtml(displayAisle)}</span><span class="aisle-count">(${count})</span>`
                });
                aisleItem.dataset.aisle = aisle;
                aisleItem.addEventListener("click", function() {
                    handleAisleClick(this.dataset.aisle);
                });
                aisleSidebar.appendChild(aisleItem);
            }
        } else {
            aisleSidebar.appendChild(el("div", { class: "no-aisles", text: "No aisles yet" }));
        }

        if (!list.length) {
            body.appendChild(el("div", { class: "empty", text: "No items saved yet. Open a product page and it will auto-add." }));
            return;
        }

        function handleDelete(itemId) {
            const cur = loadList();
            const next = cur.filter(x => x.id !== itemId);
            saveList(next);
            render();
        }

        // For sorting the selected aisle to the top. Done alphabetically.
        let displayList = [...list];
        if (selectedAisle !== null) {
            displayList.sort((a, b) => {
                const aParsed = searchAisle(a.aisle);
                const bParsed = searchAisle(b.aisle);

                let aMatches, bMatches;
                if (selectedAisle === "Unknown") {
                    aMatches = aParsed.aisleNum === null;
                    bMatches = bParsed.aisleNum === null;
                } else {
                    aMatches = aParsed.aisleNum === selectedAisle;
                    bMatches = bParsed.aisleNum === selectedAisle;
                }

                if (aMatches && !bMatches) return -1;
                if (!aMatches && bMatches) return 1;

                if (aMatches && bMatches) {
                    const aSection = aParsed.section || "ZZZ";
                    const bSection = bParsed.section || "ZZZ";
                    return aSection.localeCompare(bSection);
                }

                return 0;
            });
        }

        for (const item of displayList) {
            const name = item.name || "(no name found)";
            const sku = item.sku || "(no sku)";
            const aisle = item.aisle || "(aisle not found)";

            const parsed = searchAisle(item.aisle);
            let isHighlighted = false;
            if (selectedAisle !== null) {
                if (selectedAisle === "Unknown") {
                    isHighlighted = parsed.aisleNum === null;
                } else {
                    isHighlighted = parsed.aisleNum === selectedAisle;
                }
            }

            // For the note editor
            //__________________________________________

            // Shows note if it exists, otherwise only shows an option to add a note.
            const notesSection = el("div", { class: "notes-section" });
            const existingNote = getNote(item.sku);

            if (existingNote) {
                const noteDisplay = el("div", { class: "notes-display" }, [
                    el("span", { class: "note-text", text: `${existingNote}` }),
                    el("button", { class: "note-edit-btn", type: "button", text: "edit" })
                ]);
                noteDisplay.querySelector(".note-edit-btn").addEventListener("click", function() {
                    showNoteEditor(notesSection, item.sku, existingNote);
                });
                notesSection.appendChild(noteDisplay);
            } else if (item.sku) {
                const addNoteBtn = el("button", { class: "add-note-btn", type: "button", text: "+ Add note" });
                addNoteBtn.addEventListener("click", function() {
                    showNoteEditor(notesSection, item.sku, "");
                });
                notesSection.appendChild(addNoteBtn);
            }

            const priceStr = item.price != null ? `$${item.price.toFixed(2)}` : "";

            const meta = el("div", { class: "meta" }, [
                el("div", { class: "name", text: name }),
                el("div", { class: "sub", html: `<span><b>SKU:</b> ${escapeHtml(sku)}</span><span><b>Loc:</b> ${escapeHtml(aisle)}</span>${priceStr ? `<span class="price"><b>Price:</b> ${escapeHtml(priceStr)}</span>` : ''}` }),
                el("div", { class: "sub" }, [
                    el("a", { href: item.url || "#", target: "_blank", rel: "noopener noreferrer", text: "See Page" })
                ]),
                notesSection
            ]);

            const delBtn = el("button", { class: "del", type: "button", text: "Delete" });
            delBtn.dataset.itemId = item.id;
            delBtn.addEventListener("click", function() {
                handleDelete(this.dataset.itemId);
            });

            const row = el("div", { class: "mnRow" + (isHighlighted ? " highlighted" : "") }, [meta, delBtn]);
            body.appendChild(row);
        }
    }

    // When the note editor is open
    function showNoteEditor(container, sku, currentNote) {
        container.innerHTML = "";
        const wrapper = el("div", { class: "notes-input-wrapper" });
        const input = el("input", { class: "note-input", type: "text", placeholder: "e.g. Top shelf, left side" });
        input.value = currentNote;

        const saveBtn = el("button", { class: "note-save-btn", type: "button", text: "Save" });
        const cancelBtn = el("button", { class: "note-cancel-btn", type: "button", text: "Cancel " });

        saveBtn.addEventListener("click", function() {
            setNote(sku, input.value);
            render();
        });

        cancelBtn.addEventListener("click", function() {
            render();
        });

        input.addEventListener("keydown", function(e) {
            if (e.key === "Enter") {
                setNote(sku, input.value);
                render();
            } else if (e.key === "Escape") {
                render();
            }
        });

        wrapper.appendChild(input);
        wrapper.appendChild(saveBtn);
        wrapper.appendChild(cancelBtn);
        container.appendChild(wrapper);

        setTimeout(() => input.focus(), 0);
    }

    // Toggles whether or not an aisle is highlighted
    function handleAisleClick(aisle) {
        if (selectedAisle === aisle) {
            selectedAisle = null;
        } else {
            selectedAisle = aisle;
        }
        render();
    }

    function escapeHtml(s) {
        return String(s).replace(/[&<>"']/g, (m) => ({
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#039;"
        }[m]));
    }


    // For rendering the overlay
    //_________________________________________________________
    function ensureUI() {
        if (panel) return;

        addPickListStyles();

        const uiState = loadUIState();

        aisleSidebar = el("div", { id: "mnAisleSidebar" });
        body = el("div", { id: "mnPanelBody" });

        const contentWrapper = el("div", { id: "mnPanelContent" }, [aisleSidebar, body]);

        const minBtn = el("button", { type: "button", text: uiState.minimized ? "Expand" : "Minimize" });
        minBtn.addEventListener("click", () => {
            panel.classList.toggle("minimized");
            const minimized = panel.classList.contains("minimized");
            minBtn.textContent = minimized ? "Expand" : "Minimize";
            saveUIState({ ...loadUIState(), minimized });
        });

        const addBtn = el("button", { type: "button", text: "Add current" });
        addBtn.addEventListener("click", () => {
            captureCurrentPage(true);
        });

        const header = el("div", { id: "mnPanelHeader" }, [
            el("div", { class: "title", text: "Scanned Items" }),
            el("div", { class: "btns" }, [addBtn, minBtn])
        ]);

        const clearBtn = el("button", { type: "button", text: "Clear all" });
        clearBtn.addEventListener("click", () => {
            saveList([]);
            selectedAisle = null;
            render();
        });

        const clearNotesBtn = el("button", { class: "clear-notes-btn", type: "button", text: "Clear notes" });
        clearNotesBtn.addEventListener("click", () => {
            const count = notesCount();
            if (count === 0) {
                alert("No notes to clear.");
                return;
            }
            if (confirm(`Clear all notes?`)) {
                clearAllNotes();
                render();
            }
        });

        const footer = el("div", { id: "mnPanelFooter" }, [
            el("div", { class: "left" }, [
                el("span", { id: "mnCount", text: "" }),
                el("span", { id: "mnNotesCount", text: "" })
            ]),
            el("div", { class: "right" }, [clearNotesBtn, clearBtn])
        ]);

        panel = el("div", { id: "mnPanel" }, [header, contentWrapper, footer]);

        if (uiState.minimized) panel.classList.add("minimized");

        document.documentElement.appendChild(panel);

        const origRender = render;
        render = function () {
            origRender();
            const list = loadList();
            const countEl = document.getElementById("mnCount");
            if (countEl) countEl.textContent = `${list.length} item(s)`;
            const notesCountEl = document.getElementById("mnNotesCount");
            if (notesCountEl) {
                const notesCount = notesCount();
                notesCountEl.textContent = notesCount > 0 ? ` · ${notesCount} note(s)` : "";
            }
        };

        render();
    }

    // for avoiding storing a duplicate page. Checks against the URL

    let lastCapturedUrl = "";

    function captureCurrentPage(manual = false) {
        ensureUI();

        if (!manual && location.href === lastCapturedUrl) return;

        const product = readProductData();
        if (!isProductPage(product)) {
            lastCapturedUrl = location.href;
            return;
        }

        if (!product || (!product.sku && !product.name)) {
            if (!manual) {
                setTimeout(() => captureCurrentPage(false), 700);
            }
            return;
        }

        const aisle = AisleSection();

        const list = loadList();
        const skuKey = (product.sku || "").trim();
        const urlKey = (product.url || location.href).trim();

        const exists = list.some(x => (skuKey && x.sku === skuKey) || (!skuKey && x.url === urlKey));
        if (!exists) {
            list.unshift({
                id: randomID(),
                sku: skuKey,
                name: (product.name || "").trim(),
                aisle: aisle,
                url: urlKey,
                price: product.price,
                savedAt: new Date().toISOString()
            });
            saveList(list);
            render();
        } else if (manual) {
            const updated = list.map(x => {
                const match = (skuKey && x.sku === skuKey) || (!skuKey && x.url === urlKey);
                if (!match) return x;
                return {
                    ...x,
                    name: x.name || (product.name || "").trim(),
                    aisle: x.aisle || aisle,
                    url: x.url || urlKey,
                    price: x.price != null ? x.price : product.price
                };
            });
            saveList(updated);
            render();
        }

        lastCapturedUrl = location.href;
    }

    function randomID() {
        return Math.random().toString(16).slice(2) + "-" + Date.now().toString(16);
    }

    function hookHistoryChanges() {
        const _pushState = history.pushState;
        const _replaceState = history.replaceState;

        function fire() {
            setTimeout(() => captureCurrentPage(false), 650);
            setTimeout(() => captureCurrentPage(false), 1500);
        }

        history.pushState = function () {
            const ret = _pushState.apply(this, arguments);
            fire();
            return ret;
        };

        history.replaceState = function () {
            const ret = _replaceState.apply(this, arguments);
            fire();
            return ret;
        };

        window.addEventListener("popstate", fire);
        window.addEventListener("hashchange", fire);
    }

    function observeDomForLateData() {
        const mo = new MutationObserver(() => {
            const product = readProductData();
            if (!product || !product.sku) return;

            const aisle = AisleSection();
            if (!aisle) return;

            const list = loadList();
            const idx = list.findIndex(x => x.sku === String(product.sku).trim());
            if (idx === -1) return;

            if (!list[idx].aisle || list[idx].aisle.includes("not found")) {
                list[idx] = { ...list[idx], aisle };
                saveList(list);
                ensureUI();
                render();
            }
        });

        mo.observe(document.documentElement, { childList: true, subtree: true });
    }

    function initPickList() {
        ensureUI();
        hookHistoryChanges();
        observeDomForLateData();

        setTimeout(() => captureCurrentPage(false), 800);
        setTimeout(() => captureCurrentPage(false), 1600);
    }

    function initScanner() {
        activeScanner();
        CSSBootStrap();
        findScanButtons();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            initScanner();
            initPickList();
        });
    } else {
        initScanner();
        initPickList();
    }

})();