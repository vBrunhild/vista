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
 * @typedef {Object} StripBounds - A strip's area on the canvas, in pixels.
 * @property {number} x
 * @property {number} y
 * @property {number} width
 * @property {number} height
 */

/**
 * @typedef {Object} TokenSize - A token's size in grid units.
 * @property {number} width
 * @property {number} height
 */

/**
 * @typedef {Object} TokenTarget - Where the layout places a token.
 * @property {number} x - Left edge in pixels.
 * @property {number} y - Top edge in pixels.
 * @property {number} width - Width in grid units.
 * @property {number} height - Height in grid units.
 */

/**
 * Vista Module Configuration
 * Manages module settings and scene flags.
 */
class VistaConfig {
  /** @readonly */ static ID = "vista";
  /** @readonly */ static FLAG_ENABLED = "enabled";
  /** @readonly */ static FLAG_STRIP_COUNT = "stripCount";
  /** @readonly */ static FLAG_STRIP_LABELS = "stripLabels";
  /** @readonly */ static FLAG_TOKEN_STRIP = "stripIndex";
  /** @readonly */ static FLAG_TOKEN_BASE_SIZE = "baseSize";
  /** @readonly */ static FLAG_PAD_LEFT = "padLeft";
  /** @readonly */ static FLAG_PAD_RIGHT = "padRight";
  /** @readonly */ static FLAG_STRIP_LINES_VISIBLE = "stripLinesVisible";

  /**
   * Retrieves sanitized configuration for a given scene.
   * @param {Scene.Implementation | null} scene - The scene document.
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

    return {
      enabled: scene.getFlag(this.ID, this.FLAG_ENABLED) ?? false,
      stripCount: Math.clamp(scene.getFlag(this.ID, this.FLAG_STRIP_COUNT) ?? 2, 1, 4),
      stripLabels: scene.getFlag(this.ID, this.FLAG_STRIP_LABELS) ?? [],
      padLeft: scene.getFlag(this.ID, this.FLAG_PAD_LEFT) ?? game.settings.get(this.ID, "defaultPadLeft"),
      padRight: scene.getFlag(this.ID, this.FLAG_PAD_RIGHT) ?? game.settings.get(this.ID, "defaultPadRight"),
      stripLinesVisible: scene.getFlag(this.ID, this.FLAG_STRIP_LINES_VISIBLE)
        ?? game.settings.get(this.ID, "defaultStripLinesVisible"),
    };
  }
}

/**
 * Custom Canvas Layer for Vista Theater of the Mind Strips
 */
class VistaLayer extends foundry.canvas.layers.CanvasLayer {
  constructor () {
    super();
    /** @type {PIXI.Container | null} */
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

  /** @param {NonNullable<Parameters<foundry.canvas.layers.CanvasLayer["tearDown"]>[0]>} options */
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

    const lineColor = foundry.utils.Color.from(game.settings.get(VistaConfig.ID, "lineColor")).valueOf();
    const lineThickness = game.settings.get(VistaConfig.ID, "lineThickness");
    const lineOpacity = game.settings.get(VistaConfig.ID, "lineOpacity");

    const { sceneRect } = moduleInstance.dimensions;

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
      name: "VISTA.DebugMode",
      hint: "VISTA.DebugModeHint",
      scope: "client",
      config,
      type: Boolean,
      default: false,
    });

    game.settings.register(VistaConfig.ID, "lineColor", {
      name: "VISTA.LineColor",
      hint: "VISTA.LineColorHint",
      scope,
      config,
      type: new foundry.data.fields.ColorField({ nullable: false, initial: "#000000" }),
      onChange: () => {
        if (canvas.scene && this.isActive()) this.drawOverlay();
      },
    });

    game.settings.register(VistaConfig.ID, "lineThickness", {
      name: "VISTA.LineThickness",
      hint: "VISTA.LineThicknessHint",
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
      name: "VISTA.LineOpacity",
      hint: "VISTA.LineOpacityHint",
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
      name: "VISTA.DefaultPadLeft",
      hint: "VISTA.DefaultPadLeftHint",
      scope,
      config,
      type: Number,
      default: 0,
    });

    game.settings.register(VistaConfig.ID, "defaultPadRight", {
      name: "VISTA.DefaultPadRight",
      hint: "VISTA.DefaultPadRightHint",
      scope,
      config,
      type: Number,
      default: 0,
    });

    game.settings.register(VistaConfig.ID, "defaultStripLinesVisible", {
      name: "VISTA.DefaultStripLinesVisible",
      hint: "VISTA.DefaultStripLinesVisibleHint",
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
    const { SHIFT } = foundry.helpers.interaction.KeyboardManager.MODIFIER_KEYS;

    game.keybindings.register(VistaConfig.ID, "addStrip", {
      name: "VISTA.AddStrip",
      hint: "VISTA.AddStripHint",
      editable: [{ key: "BracketRight", modifiers: [SHIFT] }],
      restricted: true,
      onDown: () => {
        if (!this.isActive()) return false;
        const currentCount = VistaConfig.get(canvas.scene).stripCount;
        if (currentCount < 4) this.updateStripsCount(currentCount + 1);
        else ui.notifications.warn("VISTA.MaxStripsReached", { localize: true });
        return true;
      },
    });

    game.keybindings.register(VistaConfig.ID, "removeStrip", {
      name: "VISTA.RemoveStrip",
      hint: "VISTA.RemoveStripHint",
      editable: [{ key: "BracketLeft", modifiers: [SHIFT] }],
      restricted: true,
      onDown: () => {
        if (!this.isActive()) return false;
        const currentCount = VistaConfig.get(canvas.scene).stripCount;
        if (currentCount > 1) this.updateStripsCount(currentCount - 1);
        else ui.notifications.warn("VISTA.MinStripsReached", { localize: true });
        return true;
      },
    });

    game.keybindings.register(VistaConfig.ID, "toggleStripLines", {
      name: "VISTA.ToggleStripLines",
      hint: "VISTA.ToggleStripLinesHint",
      editable: [{ key: "Backslash", modifiers: [SHIFT] }],
      restricted: true,
      onDown: () => {
        const scene = canvas.scene;
        if (!scene || !this.isActive()) return false;
        const current = VistaConfig.get(scene).stripLinesVisible;
        scene.setFlag(VistaConfig.ID, VistaConfig.FLAG_STRIP_LINES_VISIBLE, !current);
        return true;
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

    Hooks.on("preMoveToken", (tokenDoc, movement) => {
      this.preMoveToken(tokenDoc, movement);
    });

    Hooks.on("preUpdateScene", (scene, updateData) => {
      return this.preUpdateScene(scene, updateData);
    });

    Hooks.on("preUpdateToken", (tokenDoc, changes, options) => {
      return this.preUpdateToken(tokenDoc, changes, options);
    });

    Hooks.on("renderSceneConfig", (app, html) => {
      return this.injectSceneConfig(app, html);
    });

    Hooks.on("updateCombat", () => {
      if (this.isActive()) this.arrangeTokensDebounced();
    });

    Hooks.on("updateCombatant", (combatant, changes) => {
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

  /**
   * The drawn scene's canvas dimensions.
   * Strips are only laid out on a drawn scene, where the dimensions are always set.
   * @returns {NonNullable<typeof canvas.dimensions>}
   */
  get dimensions() {
    return /** @type {NonNullable<typeof canvas.dimensions>} */ (canvas.dimensions);
  }

  /**
   * The Vista canvas layer, which Foundry exposes as `canvas.vista` once the canvas is drawn.
   * fvtt-types cannot be extended with custom canvas layer properties, hence the cast.
   * @returns {VistaLayer | undefined}
   */
  get layer() {
    return /** @type {{ vista?: VistaLayer }} */ (/** @type {unknown} */ (canvas)).vista;
  }

  /** @param {...unknown} args */
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
   * @param {Scene.Implementation} scene - The updated scene.
   * @param {Scene.UpdateData} changes - The changes applied.
   */
  async onUpdateScene(scene, changes) {
    if (scene.id !== canvas.scene?.id) return;
    if (!foundry.utils.hasProperty(changes, `flags.${VistaConfig.ID}`)) return;

    const enabledPath = `flags.${VistaConfig.ID}.${VistaConfig.FLAG_ENABLED}`;
    if (foundry.utils.getProperty(changes, enabledPath) === true) await this.assignStripsFromPositions();

    this.drawOverlay();
    this.lockViewport();
    this.arrangeTokensDebounced();
  }

  /**
   * Handler for the updateToken hook.
   * Re-arranges after a manual move or resize so the token snaps into its strip slot.
   * @param {TokenDocument.Implementation} tokenDoc - The updated token document.
   * @param {TokenDocument.UpdateData} changes - The changes applied.
   * @param {TokenDocument.Database.OnUpdateOptions} options - The update options.
   */
  onUpdateToken(tokenDoc, changes, options) {
    if (!this.isActive() || tokenDoc.parent !== canvas.scene) return;
    if (this.isArrangement(options)) return;
    if (!["x", "y", "width", "height"].some((key) => key in changes)) return;
    this.arrangeTokensDebounced();
  }

  /**
   * Handler for the preCreateToken hook.
   * Assigns the new token to the strip it was dropped on and records its unscaled size.
   * @param {TokenDocument.Implementation} tokenDoc - The token document being created.
   */
  preCreateToken(tokenDoc) {
    if (!this.isActive() || tokenDoc.parent !== canvas.scene) return;
    const stripIndex = this.getStripIndexForToken(tokenDoc.y, tokenDoc.height);
    // Pasted tokens carry their original's base size, while their width and height are already scaled.
    const baseSize = tokenDoc.getFlag(VistaConfig.ID, VistaConfig.FLAG_TOKEN_BASE_SIZE)
      ?? { width: tokenDoc.width, height: tokenDoc.height };
    tokenDoc.updateSource({
      [`flags.${VistaConfig.ID}.${VistaConfig.FLAG_TOKEN_STRIP}`]: stripIndex,
      [`flags.${VistaConfig.ID}.${VistaConfig.FLAG_TOKEN_BASE_SIZE}`]: baseSize,
    });
  }

  /**
   * Handler for the preMoveToken hook.
   * Prevents tokens from turning toward the drag direction, since strips have no facing.
   * @param {TokenDocument.Implementation} tokenDoc - The token document being moved.
   * @param {{ autoRotate: boolean }} movement - The pending movement operation.
   */
  preMoveToken(tokenDoc, movement) {
    if (!this.isActive() || tokenDoc.parent !== canvas.scene) return;
    movement.autoRotate = false;
  }

  /**
   * Handler for the preUpdateToken hook.
   * Reassigns the strip after a manual move and the base size after a manual resize,
   * in the same update as the change itself.
   * @param {TokenDocument.Implementation} tokenDoc - The token document being updated.
   * @param {TokenDocument.UpdateData} changes - The pending changes.
   * @param {TokenDocument.Database.PreUpdateOptions} options - The update options.
   */
  preUpdateToken(tokenDoc, changes, options) {
    if (!this.isActive() || tokenDoc.parent !== canvas.scene || this.isArrangement(options)) return;

    if (typeof changes.y === "number") {
      const stripIndex = this.getStripIndexForToken(changes.y, changes.height ?? tokenDoc.height);
      foundry.utils.setProperty(changes, `flags.${VistaConfig.ID}.${VistaConfig.FLAG_TOKEN_STRIP}`, stripIndex);
    }

    if ("width" in changes || "height" in changes) {
      const baseSize = this.getTokenBaseSize(tokenDoc);
      foundry.utils.setProperty(changes, `flags.${VistaConfig.ID}.${VistaConfig.FLAG_TOKEN_BASE_SIZE}`, {
        width: changes.width ?? baseSize.width,
        height: changes.height ?? baseSize.height,
      });
    }
  }

  /**
   * Whether an update was made by Vista's own token arrangement.
   * @param {object} options - The update options.
   * @returns {boolean}
   */
  isArrangement(options) {
    return "vistaArrangement" in options && options.vistaArrangement === true;
  }

  // ─── Core Logic ───

  /**
   * Calculates the bounding box for a specific strip within the scene area.
   * @param {number} stripIndex - The index of the strip.
   * @param {number} stripCount - Total number of strips.
   * @param {number} [padLeft=0] - Left padding.
   * @param {number} [padRight=0] - Right padding.
   * @returns {StripBounds} The bounding box.
   */
  getStripBounds(stripIndex, stripCount, padLeft = 0, padRight = 0) {
    const { sceneRect } = this.dimensions;
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
    const { sceneRect, size: gridSize } = this.dimensions;
    const centerY = y + (height * gridSize) / 2;
    const stripHeight = sceneRect.height / stripCount;
    return Math.clamp(Math.floor((centerY - sceneRect.y) / stripHeight), 0, stripCount - 1);
  }

  /**
   * Retrieves the strip a token is assigned to.
   * The stored index is clamped rather than rewritten when strips are removed,
   * so tokens return to their original strip if the count is raised again.
   * @param {TokenDocument.Implementation} tokenDoc - The token document.
   * @param {number} stripCount - Total number of strips.
   * @returns {number} The strip index.
   */
  getTokenStrip(tokenDoc, stripCount) {
    const assigned = tokenDoc.getFlag(VistaConfig.ID, VistaConfig.FLAG_TOKEN_STRIP) ?? 0;
    return Math.min(assigned, stripCount - 1);
  }

  /**
   * Retrieves a token's unscaled size in grid units.
   * Tokens placed before Vista recorded it fall back to their actor's prototype size,
   * since their current size has already been overwritten by the layout.
   * @param {TokenDocument.Implementation} tokenDoc - The token document.
   * @returns {TokenSize} The base size.
   */
  getTokenBaseSize(tokenDoc) {
    const stored = tokenDoc.getFlag(VistaConfig.ID, VistaConfig.FLAG_TOKEN_BASE_SIZE);
    if (stored) return stored;
    const prototype = tokenDoc.actor?.prototypeToken;
    return { width: prototype?.width ?? 1, height: prototype?.height ?? 1 };
  }

  /**
   * Assigns every token in the scene to the strip under its current position.
   */
  async assignStripsFromPositions() {
    const scene = canvas.scene;
    if (!scene || !game.users.activeGM?.isSelf) return;
    const updates = scene.tokens.map((tokenDoc) => ({
      _id: tokenDoc.id,
      [`flags.${VistaConfig.ID}.${VistaConfig.FLAG_TOKEN_STRIP}`]: this.getStripIndexForToken(tokenDoc.y, tokenDoc.height),
    }));
    await scene.updateEmbeddedDocuments("Token", updates);
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
    if (!this.isActive() || this.isPanLocking) return;
    this.debug("Locking viewport");
    this.isPanLocking = true;

    const { sceneRect } = this.dimensions;
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
   * @returns {Map<string, TokenTarget>} Map of token ID to its target.
   */
  calculateTokenTargets() {
    const { stripCount, padLeft, padRight } = VistaConfig.get(canvas.scene);
    const tokens = canvas.tokens?.placeables ?? [];
    /** @type {Map<string, TokenTarget>} */
    const targets = new Map();

    for (let i = 0; i < stripCount; i++) {
      const sorted = this.getSortedTokensForStrip(tokens, i, stripCount);
      if (!sorted.length) continue;

      const bounds = this.getStripBounds(i, stripCount, padLeft, padRight);
      const sizes = sorted.map((token) => this.getTokenBaseSize(token.document));
      this.layoutStrip(sizes, bounds).forEach((target, index) => targets.set(sorted[index].id, target));
    }
    return targets;
  }

  /**
   * Lays out a strip's tokens in centered rows at the largest uniform scale that fits,
   * so tokens keep their sizes relative to each other.
   * @param {TokenSize[]} sizes - Unscaled token sizes.
   * @param {StripBounds} stripBounds - Bounding box of the strip.
   * @returns {TokenTarget[]} The target of each token, in input order.
   */
  layoutStrip(sizes, stripBounds) {
    const TOKEN_PADDING = 5;
    const STRIP_PADDING = 5;
    const MIN_SCALE = 0.5;
    const MAX_SCALE = 7.5;
    const SEARCH_STEPS = 20;

    const availableWidth = stripBounds.width - STRIP_PADDING * 2;
    const availableHeight = stripBounds.height - TOKEN_PADDING * 2;
    const gridSize = this.dimensions.size;

    const widthsAt = (/** @type {number} */ scale) => sizes.map((size) => size.width * scale * gridSize);
    const rowHeightsAt = (/** @type {number[][]} */ rows, /** @type {number} */ scale) =>
      rows.map((row) => Math.max(...row.map((i) => sizes[i].height)) * scale * gridSize);
    const totalHeight = (/** @type {number[]} */ rowHeights) => rowHeights.reduce((sum, h) => sum + h, 0) + (rowHeights.length - 1) * TOKEN_PADDING;
    const fits = (/** @type {number} */ scale) => {
      const widths = widthsAt(scale);
      if (Math.max(...widths) > availableWidth) return false;
      const rows = this.packRows(widths, availableWidth, TOKEN_PADDING);
      return totalHeight(rowHeightsAt(rows, scale)) <= availableHeight;
    };

    // Binary search for the largest fitting scale. MIN_SCALE is used even if it overflows.
    let scale = MIN_SCALE;
    if (fits(MAX_SCALE)) scale = MAX_SCALE;
    else {
      let tooLarge = MAX_SCALE;
      for (let step = 0; step < SEARCH_STEPS; step++) {
        const mid = (scale + tooLarge) / 2;
        if (fits(mid)) scale = mid;
        else tooLarge = mid;
      }
    }

    const widths = widthsAt(scale);
    let rows = this.packRows(widths, availableWidth, TOKEN_PADDING);

    // Greedy packing leaves the last row short, so narrow the rows as far as possible without adding one.
    let narrowest = Math.max(...widths);
    let widest = availableWidth;
    for (let step = 0; step < SEARCH_STEPS; step++) {
      const mid = (narrowest + widest) / 2;
      if (this.packRows(widths, mid, TOKEN_PADDING).length <= rows.length) widest = mid;
      else narrowest = mid;
    }
    const balanced = this.packRows(widths, widest, TOKEN_PADDING);
    // Regrouping mixed sizes can raise row heights past the strip, in which case the greedy rows are kept.
    if (totalHeight(rowHeightsAt(balanced, scale)) <= availableHeight) rows = balanced;

    const rowHeights = rowHeightsAt(rows, scale);
    /** @type {TokenTarget[]} */
    const targets = [];
    let rowTop = stripBounds.y + (stripBounds.height - totalHeight(rowHeights)) / 2;

    rows.forEach((row, r) => {
      const rowWidth = row.reduce((sum, i) => sum + widths[i], 0) + (row.length - 1) * TOKEN_PADDING;
      let x = stripBounds.x + (stripBounds.width - rowWidth) / 2;

      for (const i of row) {
        const height = sizes[i].height * scale * gridSize;
        // Bottom-aligned so tokens of different sizes stand on a shared line.
        targets[i] = {
          x,
          y: rowTop + rowHeights[r] - height,
          width: sizes[i].width * scale,
          height: sizes[i].height * scale,
        };
        x += widths[i] + TOKEN_PADDING;
      }
      rowTop += rowHeights[r] + TOKEN_PADDING;
    });

    return targets;
  }

  /**
   * Splits tokens into consecutive rows no wider than the given width, preserving their order.
   * @param {number[]} widths - Token widths in pixels.
   * @param {number} maxWidth - The maximum row width in pixels.
   * @param {number} gap - The spacing between tokens in pixels.
   * @returns {number[][]} Token indices for each row.
   */
  packRows(widths, maxWidth, gap) {
    /** @type {number[][]} */
    const rows = [];
    /** @type {number[]} */
    let row = [];
    let rowWidth = 0;

    widths.forEach((width, i) => {
      const nextWidth = row.length ? rowWidth + gap + width : width;
      if (row.length && nextWidth > maxWidth) {
        rows.push(row);
        row = [i];
        rowWidth = width;
      } else {
        row.push(i);
        rowWidth = nextWidth;
      }
    });
    rows.push(row);
    return rows;
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
    const ARRANGE_ANIMATION_MS = 250;

    const scene = canvas.scene;
    if (!scene || !this.isActive() || !game.users.activeGM?.isSelf) return;

    const targets = this.calculateTokenTargets();
    const updates = [];
    const tokens = canvas.tokens?.placeables ?? [];

    for (const token of tokens) {
      const target = targets.get(token.id);
      if (!target) continue;

      /** @type {Partial<TokenTarget> & { _id?: string }} */
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
      // A fixed duration, as scaled-up tokens travel many grid units at the default movement speed.
      // Built apart from the call so TypeScript accepts the custom vistaArrangement option.
      const options = { vistaArrangement: true, animation: { duration: ARRANGE_ANIMATION_MS } };
      await scene.updateEmbeddedDocuments("Token", updates, options);
    }
  }

  // ─── Visuals ───

  /**
   * Draws the overlay lines and labels.
   */
  drawOverlay() {
    if (!canvas?.ready) return;

    const config = VistaConfig.get(canvas.scene);
    this.layer?.renderStrips(config, this);
  }

  /**
   * Injects the Vista settings into the Scene Configuration dialog.
   * @param {foundry.applications.sheets.SceneConfig} app - The app instance.
   * @param {HTMLElement} html - The HTML content.
   */
  injectSceneConfig(app, html) {
    // Partial re-renders keep untouched parts, which may already hold the section.
    if (html.querySelector(".vista-config")) return;

    const scene = app.document;
    const flags = VistaConfig.get(scene);

    const section = `
    <fieldset class="vista-config">
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
        <input type="text" name="flags.${VistaConfig.ID}.${VistaConfig.FLAG_STRIP_LABELS}" value="${foundry.utils.escapeHTML(flags.stripLabels.join(", "))}" placeholder="${game.i18n.localize("VISTA.StripLabelsPlaceholder")}" />
        <p class="notes">${game.i18n.localize("VISTA.StripLabelsHint")}</p>
      </div>
      <div class="form-group">
        <label>${game.i18n.localize("VISTA.ShowStripLines")}</label>
        <input type="checkbox" name="flags.${VistaConfig.ID}.${VistaConfig.FLAG_STRIP_LINES_VISIBLE}" ${flags.stripLinesVisible ? "checked" : ""} />
        <p class="notes">${game.i18n.localize("VISTA.ShowStripLinesHint")}</p>
      </div>
      <div class="form-group">
        <label>${game.i18n.localize("VISTA.PadLeft")}</label>
        <input type="number" name="flags.${VistaConfig.ID}.${VistaConfig.FLAG_PAD_LEFT}" value="${flags.padLeft}" min="0" step="10" />
        <p class="notes">${game.i18n.localize("VISTA.PadLeftHint")}</p>
      </div>
      <div class="form-group">
        <label>${game.i18n.localize("VISTA.PadRight")}</label>
        <input type="number" name="flags.${VistaConfig.ID}.${VistaConfig.FLAG_PAD_RIGHT}" value="${flags.padRight}" min="0" step="10" />
        <p class="notes">${game.i18n.localize("VISTA.PadRightHint")}</p>
      </div>
    </fieldset>`;

    const basicsTab = html.querySelector('.tab[data-tab="basics"]');
    if (basicsTab) {
      basicsTab.insertAdjacentHTML("beforeend", section);
    } else {
      const target = html.querySelector('button[type="submit"]');
      if (target) {
        const insertPoint = target.closest(".form-group, .sheet-footer") ?? target.parentElement;
        insertPoint?.insertAdjacentHTML("beforebegin", section);
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
