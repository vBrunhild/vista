/**
 * @typedef {Object} VistaSceneConfig
 * @property {boolean} enabled - Whether the vista is active.
 * @property {number} stripCount - Number of strips (clamped 1-4).
 * @property {string[]} stripLabels - Labels for each strip.
 * @property {number} padLeft - Left padding value.
 * @property {number} padRight - Right padding value.
 * @property {boolean} stripLinesVisible - Toggle for line visibility.
 */

/**
 * Vista Module Configuration
 * Manages module settings and scene flags.
 */
class VistaConfig {
  static ID = "vista";
  static FLAG_ENABLED = "enabled";
  static FLAG_STRIP_COUNT = "stripCount";
  static FLAG_STRIP_LABELS = "stripLabels";
  static FLAG_TOKEN_STRIP = "stripIndex";
  static FLAG_PAD_LEFT = "padLeft";
  static FLAG_PAD_RIGHT = "padRight";
  static FLAG_STRIP_LINES_VISIBLE = "stripLinesVisible";

  /**
   * Retrieves sanitized configuration for a given scene.
   * @param {Scene} scene - The scene document.
   * @returns {VistaSceneConfig} The configuration object.
   */
  static get(scene) {
    if (!scene) {
      return {
        enabled: false,
        stripCount: 2,
        stripLabels: [],
        padLeft: 0,
        padRight: 0,
        stripLinesVisible: true,
      };
    }

    /** @type {<T>(key: string, fallback: T) => T} */
    const getFlag = (key, fallback) => scene.getFlag(this.ID, key) ?? fallback;
    /** @type {<T>(key: string) => T} */
    const getSetting = (key) => game.settings.get(this.ID, key);

    return {
      enabled: getFlag(this.FLAG_ENABLED, false),
      stripCount: Math.clamp(getFlag(this.FLAG_STRIP_COUNT, 2), 1, 4),
      stripLabels: getFlag(this.FLAG_STRIP_LABELS, []),
      padLeft: getFlag(this.FLAG_PAD_LEFT, getSetting("defaultPadLeft")),
      padRight: getFlag(this.FLAG_PAD_RIGHT, getSetting("defaultPadRight")),
      stripLinesVisible: getFlag(
        this.FLAG_STRIP_LINES_VISIBLE,
        getSetting("defaultStripLinesVisible")
      ),
    };
  }
}

/**
 * Custom Canvas Layer for Vista Theater of the Mind Strips
 */
class VistaLayer extends foundry.canvas.layers.CanvasLayer {
  constructor () {
    super();
    this.overlayContainer = null;
  }

  static get layerOptions() {
    return foundry.utils.mergeObject(super.layerOptions, {
      name: "vista",
      zIndex: 250,
    });
  }

  async _draw() {
    this.overlayContainer = this.addChild(new PIXI.Container());
    this.overlayContainer.name = "vista-strip-overlay";
  }

  async _tearDown(options) {
    this.overlayContainer = null;
    return super._tearDown(options);
  }

  /**
   * @param {VistaSceneConfig} config
   * @param {VistaModule} moduleInstance
   */
  renderStrips(config, moduleInstance) {
    if (!this.overlayContainer) return;

    this.overlayContainer.removeChildren().forEach(c => c.destroy());
    if (!config.enabled) return;

    const {
      stripCount,
      stripLabels,
      padLeft,
      padRight,
      stripLinesVisible
    } = config;

    const lineColorHex = game.settings.get(VistaConfig.ID, "lineColor");
    const lineColor = parseInt(lineColorHex.replace('#', ''), 16);
    const lineThickness = game.settings.get(VistaConfig.ID, "lineThickness");
    const lineOpacity = game.settings.get(VistaConfig.ID, "lineOpacity");

    const { sceneRect } = canvas.dimensions;

    for (let i = 0; i < stripCount; i++) {
      const bounds = moduleInstance.getStripBounds(i, stripCount, padLeft, padRight);

      if (i > 0 && stripLinesVisible) {
        const line = new PIXI.Graphics()
          .lineStyle(lineThickness, lineColor, lineOpacity)
          .moveTo(sceneRect.x, bounds.y)
          .lineTo(sceneRect.right, bounds.y);

        this.overlayContainer.addChild(line);
      }

      const label = stripLabels[i];
      if (label) {
        const style = new PIXI.TextStyle({
          fontFamily: "Signika",
          fontSize: 28,
          fill: "#ffffff",
          stroke: "#000000",
          strokeThickness: 3,
          dropShadow: true,
          dropShadowDistance: 2,
        });

        const text = new PIXI.Text(label, style);
        text.anchor.set(0, 0);
        text.position.set(bounds.x + 20, bounds.y + 10);
        this.overlayContainer.addChild(text);
      }
    }
  }
}

/**
 * Vista Module Logic
 */
class VistaModule {
  constructor() {
    this.isPanLocking = false;
    this.arrangeTokensDebounced = foundry.utils.debounce(
      this.arrangeTokens.bind(this), 50
    );
  }

  /**
   * Initializes the module.
   */
  init() {
    console.log(`${VistaConfig.ID} | Initializing Vista - Theater of the Mind Strips`);
    this.registerSettings();
    this.registerKeybindings();
    this.registerHooks();
  }

  /**
   * Registers module-specific settings.
   */
  registerSettings() {
    const scope = "world";
    const config = true;

    game.settings.register(VistaConfig.ID, "debugMode", {
      name: "Debug Mode",
      hint: "Enable debug logging to the console for troubleshooting",
      scope: "client",
      config,
      type: Boolean,
      default: false,
    });

    game.settings.register(VistaConfig.ID, "lineColor", {
      name: "Strip Divider Color",
      hint: "Color of the horizontal lines between strips (hex color)",
      scope,
      config,
      type: String,
      default: "#000000",
      onChange: () => {
        if (canvas.scene && this.isActive()) this.drawOverlay();
      },
    });

    game.settings.register(VistaConfig.ID, "lineThickness", {
      name: "Strip Divider Thickness",
      hint: "Thickness of the horizontal lines between strips (in pixels)",
      scope,
      config,
      type: Number,
      default: 3,
      range: { min: 1, max: 10, step: 1 },
      onChange: () => {
        if (canvas.scene && this.isActive()) this.drawOverlay();
      },
    });

    game.settings.register(VistaConfig.ID, "lineOpacity", {
      name: "Strip Divider Opacity",
      hint: "Opacity of the horizontal lines between strips (0.0 = transparent, 1.0 = opaque)",
      scope,
      config,
      type: Number,
      default: 0.6,
      range: { min: 0.0, max: 1.0, step: 0.1 },
      onChange: () => {
        if (canvas.scene && this.isActive()) this.drawOverlay();
      },
    });

    game.settings.register(VistaConfig.ID, "defaultPadLeft", {
      name: "Default Pad Left",
      hint: "Default horizontal offset from the left for new scenes (pixels).",
      scope,
      config,
      type: Number,
      default: 0,
    });

    game.settings.register(VistaConfig.ID, "defaultPadRight", {
      name: "Default Pad Right",
      hint: "Default horizontal offset from the right for new scenes (pixels).",
      scope,
      config,
      type: Number,
      default: 0,
    });

    game.settings.register(VistaConfig.ID, "defaultStripLinesVisible", {
      name: "Default Strip Lines Visible",
      hint: "Whether strip separator lines are visible by default for new scenes.",
      scope,
      config,
      type: Boolean,
      default: true,
    });
  }

  /**
   * Registers keybindings for strip manipulation.
   */
  registerKeybindings() {
    game.keybindings.register(VistaConfig.ID, "addStrip", {
      name: game.i18n.localize("VISTA.AddStrip"),
      hint: "Add one strip to the current scene (max 4).",
      editable: [{ key: "BracketRight", modifiers: ["Shift"] }],
      restricted: true,
      onDown: async () => {
        if (!this.isActive()) return;
        const currentCount = VistaConfig.get(canvas.scene).stripCount;
        if (currentCount < 4) await this.updateStripsCount(currentCount + 1);
        else ui.notifications.warn("Vista: Maximum of 4 strips reached.");
      },
    });

    game.keybindings.register(VistaConfig.ID, "removeStrip", {
      name: game.i18n.localize("VISTA.RemoveStrip"),
      hint: "Remove one strip from the current scene (min 1).",
      editable: [{ key: "BracketLeft", modifiers: ["Shift"] }],
      restricted: true,
      onDown: async () => {
        if (!this.isActive()) return;
        const currentCount = VistaConfig.get(canvas.scene).stripCount;
        if (currentCount > 1) await this.updateStripsCount(currentCount - 1);
        else ui.notifications.warn("Vista: Minimum of 1 strip required.");
      },
    });

    game.keybindings.register(VistaConfig.ID, "toggleStripLines", {
      name: "Toggle Strip Lines",
      hint: "Toggle visibility of the strip separator lines for the current scene.",
      editable: [{ key: "Backslash", modifiers: ["Shift"] }],
      restricted: true,
      onDown: async () => {
        if (!this.isActive()) return;
        const scene = canvas.scene;
        const current = VistaConfig.get(scene).stripLinesVisible;
        await scene.setFlag(VistaConfig.ID, VistaConfig.FLAG_STRIP_LINES_VISIBLE, !current);
      },
    });
  }

  /**
   * Registers foundry hooks.
   */
  registerHooks() {
    Hooks.on("canvasPan", () => {
      if (this.isActive()) this.lockViewport();
    });

    Hooks.on("canvasReady", () => {
      return this.onCanvasReady();
    });

    Hooks.on("createCombatant", () => {
      if (this.isActive()) this.arrangeTokensDebounced();
    });

    Hooks.on("createToken", () => {
      if (this.isActive()) this.arrangeTokensDebounced();
    });

    Hooks.on("deleteCombat", () => {
      if (this.isActive()) this.arrangeTokensDebounced();
    });

    Hooks.on("deleteCombatant", () => {
      if (this.isActive()) this.arrangeTokensDebounced();
    });

    Hooks.on("deleteToken", () => {
      if (this.isActive()) this.arrangeTokensDebounced();
    });

    Hooks.on("preCreateToken", (tokenDoc) => {
      return this.preCreateToken(tokenDoc);
    });

    Hooks.on("preUpdateScene", (scene, updateData) => {
      return this.preUpdateScene(scene, updateData);
    });

    Hooks.on("preUpdateToken", (tokenDoc, changes, options) => {
      return this.preUpdateToken(tokenDoc, changes, options);
    });

    Hooks.on("renderSceneConfig", (app, html, data) => {
      return this.injectSceneConfig(app, html, data);
    });

    Hooks.on("updateCombat", (c, changes) => {
      if (this.isActive()) this.arrangeTokensDebounced();
    });

    Hooks.on("updateCombatant", (c, changes) => {
      if (this.isActive() && "initiative" in changes) this.arrangeTokensDebounced();
    });

    Hooks.on("updateScene", (scene, changes) => {
      return this.onUpdateScene(scene, changes);
    });

    Hooks.on("updateToken", (tokenDoc, changes, options) => {
      return this.onUpdateToken(tokenDoc, changes, options);
    });
  }

  isActive() {
    return VistaConfig.get(canvas.scene).enabled;
  }

  debug(...args) {
    if (game.settings.get(VistaConfig.ID, "debugMode")) {
      console.log(`[Vista Debug]`, ...args);
    }
  }

  // ─── Event Handlers ───

  /**
   * Handler for the canvasReady hook.
   * Initializes overlay and token arrangement.
   */
  onCanvasReady() {
    if (!this.isActive()) return;
    this.drawOverlay();
    this.lockViewport();
    this.arrangeTokensDebounced();
  }

  /**
   * Handler for the updateScene hook.
   * Responds to changes in scene flags.
   * @param {Scene} scene - The updated scene.
   * @param {object} changes - The changes applied.
   */
  onUpdateScene(scene, changes) {
    if (scene.id !== canvas.scene?.id) return;
    if (!foundry.utils.hasProperty(changes, `flags.${VistaConfig.ID}`)) return;

    this.drawOverlay();
    this.lockViewport();
    this.arrangeTokensDebounced();
  }

  /**
   * Handler for the updateToken hook.
   * Re-arranges after a manual move so the token snaps into its strip slot.
   * @param {TokenDocument} tokenDoc - The updated token document.
   * @param {object} changes - The changes applied.
   * @param {object} options - The update options.
   */
  onUpdateToken(tokenDoc, changes, options) {
    if (!this.isActive() || tokenDoc.parent !== canvas.scene) return;
    if (options.vistaArrangement) return;
    if (!("x" in changes || "y" in changes)) return;
    this.arrangeTokensDebounced();
  }

  /**
   * Handler for the preCreateToken hook.
   * Assigns the new token to the strip it was dropped on.
   * @param {TokenDocument} tokenDoc - The token document being created.
   */
  preCreateToken(tokenDoc) {
    if (!this.isActive() || tokenDoc.parent !== canvas.scene) return;
    const stripIndex = this.getStripIndexForToken(tokenDoc.y, tokenDoc.height);
    tokenDoc.updateSource({ [`flags.${VistaConfig.ID}.${VistaConfig.FLAG_TOKEN_STRIP}`]: stripIndex });
  }

  /**
   * Handler for the preUpdateToken hook.
   * Reassigns the strip in the same update as a manual move.
   * @param {TokenDocument} tokenDoc - The token document being updated.
   * @param {object} changes - The pending changes.
   * @param {object} options - The update options.
   */
  preUpdateToken(tokenDoc, changes, options) {
    if (!this.isActive() || tokenDoc.parent !== canvas.scene) return;
    if (options.vistaArrangement || !("y" in changes)) return;
    const stripIndex = this.getStripIndexForToken(changes.y, changes.height ?? tokenDoc.height);
    foundry.utils.setProperty(changes, `flags.${VistaConfig.ID}.${VistaConfig.FLAG_TOKEN_STRIP}`, stripIndex);
  }

  // ─── Core Logic ───

  /**
   * Calculates the bounding box for a specific strip within the scene area.
   * @param {number} stripIndex - The index of the strip.
   * @param {number} stripCount - Total number of strips.
   * @param {number} [padLeft=0] - Left padding.
   * @param {number} [padRight=0] - Right padding.
   * @returns {object} The bounding box {x, y, width, height}.
   */
  getStripBounds(stripIndex, stripCount, padLeft = 0, padRight = 0) {
    const { sceneRect } = canvas.dimensions;
    const stripHeight = sceneRect.height / stripCount;
    return {
      x: sceneRect.x + padLeft,
      y: sceneRect.y + stripIndex * stripHeight,
      width: sceneRect.width - padLeft - padRight,
      height: stripHeight,
    };
  }

  /**
   * Determines which strip contains the center of a token.
   * @param {number} y - The token's top Y-coordinate.
   * @param {number} height - The token's height in grid units.
   * @returns {number} The strip index.
   */
  getStripIndexForToken(y, height) {
    const { stripCount } = VistaConfig.get(canvas.scene);
    const { sceneRect } = canvas.dimensions;
    const centerY = y + (height * canvas.grid.size) / 2;
    const stripHeight = sceneRect.height / stripCount;
    return Math.clamp(Math.floor((centerY - sceneRect.y) / stripHeight), 0, stripCount - 1);
  }

  /**
   * Retrieves the strip a token is assigned to.
   * The stored index is clamped rather than rewritten when strips are removed,
   * so tokens return to their original strip if the count is raised again.
   * @param {TokenDocument} tokenDoc - The token document.
   * @param {number} stripCount - Total number of strips.
   * @returns {number} The strip index.
   */
  getTokenStrip(tokenDoc, stripCount) {
    const assigned = tokenDoc.getFlag(VistaConfig.ID, VistaConfig.FLAG_TOKEN_STRIP) ?? 0;
    return Math.min(assigned, stripCount - 1);
  }

  /**
   * Updates the strip count flag for the scene.
   * @param {number} newCount - The new strip count.
   */
  async updateStripsCount(newCount) {
    const scene = canvas.scene;
    if (!scene) return;
    newCount = Math.clamp(newCount, 1, 4);
    const oldCount = VistaConfig.get(scene).stripCount;
    if (oldCount === newCount) return;
    await scene.setFlag(VistaConfig.ID, VistaConfig.FLAG_STRIP_COUNT, newCount);
  }

  /**
   * Locks the viewport to center the scene.
   */
  lockViewport() {
    console.log("Vista | lockViewport called");
    if (!this.isActive() || this.isPanLocking) {
      console.log(
        "Vista | lockViewport skipped",
        { isActive: this.isActive(), isPanLocking: this.isPanLocking }
      );
      return;
    }
    this.isPanLocking = true;

    const { sceneRect } = canvas.dimensions;
    const scale = Math.min(
      window.innerWidth / sceneRect.width,
      window.innerHeight / sceneRect.height
    );

    canvas.pan({ x: sceneRect.center.x, y: sceneRect.center.y, scale });
    requestAnimationFrame(() => { this.isPanLocking = false; });
  }

  // ─── Token Layout & Updates ───

  /**
   * Calculates the target layout for all tokens in the scene.
   * Separates layout logic from document update logic.
   * @returns {Map<string, object>} Map of token ID to target properties {x, y, width, height}.
   */
  calculateTokenTargets() {
    const { stripCount, padLeft, padRight } = VistaConfig.get(canvas.scene);
    const tokens = canvas.tokens.placeables;
    const baseSize = canvas.grid.size;
    const targets = new Map();

    const TOKEN_PADDING = 5;
    const ROW_OFFSET_RATIO = 0.5;

    for (let i = 0; i < stripCount; i++) {
      const sorted = this.getSortedTokensForStrip(tokens, i, stripCount);
      if (!sorted.length) continue;

      const bounds = this.getStripBounds(i, stripCount, padLeft, padRight);

      const { scale, rowCount, scaledSize } = this.computeTokenLayout(
        sorted.length,
        baseSize,
        bounds
      );

      const baseTokensPerRow = Math.floor(sorted.length / rowCount);
      const extraTokens = sorted.length % rowCount;
      const totalRowsHeight = rowCount * scaledSize + (rowCount - 1) * TOKEN_PADDING;

      let currentY = bounds.y + (bounds.height - totalRowsHeight) / 2;
      let tokenIndex = 0;

      for (let row = 0; row < rowCount; row++) {
        const tokensInThisRow = row < extraTokens ? baseTokensPerRow + 1 : baseTokensPerRow;
        const isOddRow = row % 2 === 1;
        const isOddLenInRow = sorted.length % 2 === 1;
        const rowWidth = tokensInThisRow * scaledSize + (tokensInThisRow - 1) * TOKEN_PADDING;

        let startX = bounds.x + (bounds.width - rowWidth) / 2;
        if (isOddRow && !isOddLenInRow) {
          startX += (scaledSize + TOKEN_PADDING) * ROW_OFFSET_RATIO;
        }

        for (let col = 0; col < tokensInThisRow; col++) {
          const token = sorted[tokenIndex++];
          const targetX = startX + col * (scaledSize + TOKEN_PADDING);
          const targetY = currentY;

          targets.set(token.id, {
            x: targetX,
            y: targetY,
            width: scale,
            height: scale
          });
        }
        currentY += scaledSize + TOKEN_PADDING;
      }
    }
    return targets;
  }

  /**
   * Computes the layout parameters for tokens within a strip.
   * @param {number} tokenCount - Number of tokens.
   * @param {number} baseTokenSize - Base size of a token.
   * @param {object} stripBounds - Bounding box of the strip.
   * @returns {object} Layout parameters {scale, tokensPerRow, rowCount, scaledSize}.
   */
  computeTokenLayout(tokenCount, baseTokenSize, stripBounds) {
    const TOKEN_PADDING = 5;
    const STRIP_PADDING = 5;
    const MIN_SCALE = 0.5;
    const MAX_SCALE = 7.5;

    if (tokenCount === 0) return { scale: 1.0, tokensPerRow: 0, rowCount: 1 };

    const availableHeight = stripBounds.height - TOKEN_PADDING * 2;
    const availableWidth = stripBounds.width - STRIP_PADDING * 2;

    let scale = Math.clamp(availableHeight / baseTokenSize, MIN_SCALE, MAX_SCALE);
    let scaledSize = baseTokenSize * scale;
    let tokensPerRow = Math.max(1, Math.floor((availableWidth + TOKEN_PADDING) / (scaledSize + TOKEN_PADDING)));
    let rowCount = Math.ceil(tokenCount / tokensPerRow);

    if (rowCount > 1) {
      const totalRowHeight = rowCount * scaledSize + (rowCount - 1) * TOKEN_PADDING;
      if (totalRowHeight > availableHeight) {
        scale = (availableHeight - (rowCount - 1) * TOKEN_PADDING) / (rowCount * baseTokenSize);
        scale = Math.clamp(scale, MIN_SCALE, MAX_SCALE);
        scaledSize = baseTokenSize * scale;
        tokensPerRow = Math.max(1, Math.floor((availableWidth + TOKEN_PADDING) / (scaledSize + TOKEN_PADDING)));
        rowCount = Math.ceil(tokenCount / tokensPerRow);
      }
    }
    return { scale, tokensPerRow, rowCount, scaledSize };
  }

  /**
   * Retrieves and sorts tokens for a specific strip.
   * Sorting is based on combat turn (if active) or alphabetical order.
   * @param {Token[]} tokens - Array of token placeables.
   * @param {number} stripIndex - The strip index.
   * @param {number} stripCount - Total number of strips.
   * @returns {Token[]} Sorted array of tokens.
   */
  getSortedTokensForStrip(tokens, stripIndex, stripCount) {
    const combat = game.combat;
    const inCombat = combat?.started;

    const stripTokens = tokens.filter((t) => this.getTokenStrip(t.document, stripCount) === stripIndex);

    if (!inCombat) {
      stripTokens.sort((a, b) => (a.document.name ?? "").localeCompare(b.document.name ?? ""));
      return stripTokens;
    }

    const tokenIdToTurnIndex = new Map();
    combat.turns.forEach((turn, index) => tokenIdToTurnIndex.set(turn.tokenId, index));

    stripTokens.sort((a, b) => {
      const turnIndexA = tokenIdToTurnIndex.get(a.id);
      const turnIndexB = tokenIdToTurnIndex.get(b.id);
      if (turnIndexA !== undefined && turnIndexB !== undefined) return turnIndexA - turnIndexB;
      if (turnIndexA !== undefined) return -1;
      if (turnIndexB !== undefined) return 1;
      return (a.document.name ?? "").localeCompare(b.document.name ?? "");
    });

    return stripTokens;
  }

  /**
   * Main orchestrator function: Calculates layout, compares with current state, and applies updates.
   */
  async arrangeTokens() {
    if (!this.isActive() || !game.users.activeGM?.isSelf) return;

    const targets = this.calculateTokenTargets();
    const updates = [];
    const tokens = canvas.tokens.placeables;

    for (const token of tokens) {
      const target = targets.get(token.id);
      if (!target) continue;

      const tokenUpdates = {};
      let hasChanges = false;

      if (Math.abs(token.document.x - target.x) > 1) {
        tokenUpdates.x = target.x;
        hasChanges = true;
      }
      if (Math.abs(token.document.y - target.y) > 1) {
        tokenUpdates.y = target.y;
        hasChanges = true;
      }
      if (Math.abs((token.document.width ?? 1) - target.width) > 0.01) {
        tokenUpdates.width = target.width;
        hasChanges = true;
      }
      if (Math.abs((token.document.height ?? 1) - target.height) > 0.01) {
        tokenUpdates.height = target.height;
        hasChanges = true;
      }

      if (hasChanges) {
        tokenUpdates._id = token.id;
        updates.push(tokenUpdates);
      }
    }

    if (updates.length > 0) {
      this.debug(`Batch updating ${updates.length} tokens`);
      await canvas.scene.updateEmbeddedDocuments("Token", updates, { vistaArrangement: true });
    }
  }

  // ─── Visuals ───

  /**
   * Draws the overlay lines and labels.
   */
  drawOverlay() {
    if (!canvas?.ready || !canvas.vista) return;

    const config = VistaConfig.get(canvas.scene);
    canvas.vista.renderStrips(config, this);
  }

  /**
   * Injects the Vista settings into the Scene Configuration dialog.
   * @param {FormApplication} app - The app instance.
   * @param {HTMLElement} html - The HTML content.
   * @param {object} data - The data object.
   */
  injectSceneConfig(app, html, data) {
    const scene = app.document;
    const flags = VistaConfig.get(scene);

    const section = `
    <fieldset>
      <legend><i class="fas fa-theater-masks"></i> ${game.i18n.localize("VISTA.Settings")}</legend>
      <div class="form-group">
        <label>${game.i18n.localize("VISTA.EnableStrips")}</label>
        <input type="checkbox" name="flags.${VistaConfig.ID}.${VistaConfig.FLAG_ENABLED}" ${flags.enabled ? "checked" : ""} />
        <p class="notes">${game.i18n.localize("VISTA.EnableStripsHint")}</p>
      </div>
      <div class="form-group">
        <label>${game.i18n.localize("VISTA.StripCount")}</label>
        <input type="number" name="flags.${VistaConfig.ID}.${VistaConfig.FLAG_STRIP_COUNT}" value="${flags.stripCount}" min="1" max="4" step="1" />
        <p class="notes">${game.i18n.localize("VISTA.StripCountHint")}</p>
      </div>
      <div class="form-group">
        <label>${game.i18n.localize("VISTA.StripLabels")}</label>
        <input type="text" name="flags.${VistaConfig.ID}.${VistaConfig.FLAG_STRIP_LABELS}" value="${(flags.stripLabels ?? []).join(", ")}" placeholder="Bar, Common Room, Stage" />
        <p class="notes">${game.i18n.localize("VISTA.StripLabelsHint")}</p>
      </div>
      <div class="form-group">
        <label>Show Strip Lines</label>
        <input type="checkbox" name="flags.${VistaConfig.ID}.${VistaConfig.FLAG_STRIP_LINES_VISIBLE}" ${flags.stripLinesVisible ? "checked" : ""} />
        <p class="notes">Visible separator lines between strips.</p>
      </div>
      <div class="form-group">
        <label>Pad Left (px)</label>
        <input type="number" name="flags.${VistaConfig.ID}.${VistaConfig.FLAG_PAD_LEFT}" value="${flags.padLeft}" min="0" step="10" />
        <p class="notes">Offset strip content from the left.</p>
      </div>
      <div class="form-group">
        <label>Pad Right (px)</label>
        <input type="number" name="flags.${VistaConfig.ID}.${VistaConfig.FLAG_PAD_RIGHT}" value="${flags.padRight}" min="0" step="10" />
        <p class="notes">Offset strip content from the right.</p>
      </div>
    </fieldset>`;

    const basicsTab = html.querySelector('.tab[data-tab="basics"]');
    if (basicsTab) {
      basicsTab.insertAdjacentHTML("beforeend", section);
    } else {
      const target = html.querySelector('button[type="submit"]');
      if (target) {
        const insertPoint = target.closest(".form-group, .sheet-footer") ?? target.parentElement;
        insertPoint.insertAdjacentHTML("beforebegin", section);
      }
    }
    app.setPosition({ height: "auto" });
  }

  /**
   * Pre-update handler for scene changes.
   * Processes string input for labels into an array.
   * @param {Scene} scene - The scene document.
   * @param {object} updateData - The update data.
   */
  preUpdateScene(scene, updateData) {
    const labelPath = `flags.${VistaConfig.ID}.${VistaConfig.FLAG_STRIP_LABELS}`;
    const raw = foundry.utils.getProperty(updateData, labelPath);
    if (typeof raw === "string") {
      const arr = raw.split(",").map((s) => s.trim()).filter(Boolean);
      foundry.utils.setProperty(updateData, labelPath, arr);
    }
  }
}

const vista = new VistaModule();
Hooks.once("init", () => {
  CONFIG.Canvas.layers.vista = {
    group: "interface",
    layerClass: VistaLayer
  };

  vista.init()
});
