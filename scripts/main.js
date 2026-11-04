/**
 * @typedef {Object} VistaSceneConfig
 * @property {boolean} enabled - Whether the vista is active.
 * @property {number} stripCount - Number of strips (clamped 1-4).
 * @property {string[]} stripLabels - Labels for each strip.
 * @property {number} padLeft - Left padding value.
 * @property {number} padRight - Right padding value.
 * @property {boolean} stripLinesVisible - Toggle for line visibility.
 * @property {boolean} sideBySide - Whether strips are columns placed side by side instead of stacked rows.
 * @property {boolean} backstage - Whether the scene has a GM-only backstage area right of the scene.
 * @property {string} background - Path of an image filling each viewer's whole view, or empty for none.
 */

/**
 * @typedef {Object} StripBounds - A strip's area on the canvas, in pixels.
 * @property {number} x
 * @property {number} y
 * @property {number} width
 * @property {number} height
 */

/**
 * @typedef {NonNullable<typeof canvas.dimensions> & { scale: { min: number, max: number }, uiScale: number }} CanvasDimensions
 */

/**
 * @typedef {Object} TokenSize - A token's size in grid units.
 * @property {number} width
 * @property {number} height
 */

/**
 * @typedef {Object} VistaMovement - The parts of a pending token movement Vista reads or changes.
 * @property {boolean} autoRotate
 * @property {{ x: number, y: number }} origin
 * @property {{ x: number, y: number }} destination
 */

/**
 * @typedef {Object} TokenTarget - A token's position and size, such as where the layout places it.
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
  /** @readonly */ static FLAG_PAD_LEFT = "padLeft";
  /** @readonly */ static FLAG_PAD_RIGHT = "padRight";
  /** @readonly */ static FLAG_STRIP_LINES_VISIBLE = "stripLinesVisible";
  /** @readonly */ static FLAG_SIDE_BY_SIDE = "sideBySide";
  /** @readonly */ static FLAG_BACKSTAGE = "backstage";
  /** @readonly */ static FLAG_BACKGROUND = "background";
  /** @readonly */ static FLAG_TOKEN_BACKSTAGE = "inBackstage";
  /** @readonly */ static FLAG_TOKEN_STATUS = "status";

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
        sideBySide: false,
        backstage: false,
        background: "",
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
      sideBySide: scene.getFlag(this.ID, this.FLAG_SIDE_BY_SIDE) ?? false,
      backstage: scene.getFlag(this.ID, this.FLAG_BACKSTAGE) ?? false,
      background: scene.getFlag(this.ID, this.FLAG_BACKGROUND) ?? "",
    };
  }
}

/**
 * Canvas layer beneath the whole canvas, showing the Vista background image in the margins outside the
 * canvas rectangle. Inside it, the primary group paints over this layer and draws its own copy.
 */
class VistaBackgroundLayer extends foundry.canvas.layers.CanvasLayer {
  constructor() {
    super();
    /** @type {PIXI.Sprite | null} */
    this.sprite = null;
    // Plain canvas layers ignore the zIndex layer option, so it is set directly to sort below the environment.
    this.zIndex = -100;
  }

  static get layerOptions() {
    return foundry.utils.mergeObject(super.layerOptions, { name: "vistaBackground" });
  }

  async _draw() {
    this.sprite = this.addChild(new PIXI.Sprite());
    this.sprite.visible = false;
  }

  /** @param {NonNullable<Parameters<foundry.canvas.layers.CanvasLayer["tearDown"]>[0]>} options */
  async _tearDown(options) {
    this.sprite = null;
    return super._tearDown(options);
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
      stripLinesVisible,
      sideBySide,
    } = config;

    const lineColor = foundry.utils.Color.from(game.settings.get(VistaConfig.ID, "lineColor")).valueOf();
    const lineThickness = game.settings.get(VistaConfig.ID, "lineThickness");
    const lineOpacity = game.settings.get(VistaConfig.ID, "lineOpacity");

    const { sceneRect } = moduleInstance.dimensions;

    for (let i = 0; i < stripCount; i++) {
      const bounds = moduleInstance.getStripBounds(i, config);

      if (i > 0 && stripLinesVisible) {
        const line = new PIXI.Graphics().lineStyle(lineThickness, lineColor, lineOpacity);
        if (sideBySide) line.moveTo(bounds.x, sceneRect.y).lineTo(bounds.x, sceneRect.bottom);
        else line.moveTo(sceneRect.x, bounds.y).lineTo(sceneRect.right, bounds.y);

        this.overlayContainer.addChild(line);
      }

      const label = stripLabels[i];
      if (label) this.overlayContainer.addChild(this.createLabel(label, bounds));
    }

    const backstage = moduleInstance.getBackstageBounds(config);
    if (backstage && game.user.isGM) {
      const area = new PIXI.Graphics()
        .beginFill(0x000000, 0.25)
        .drawRect(backstage.x, backstage.y, backstage.width, backstage.height)
        .endFill()
        .lineStyle(lineThickness, lineColor, lineOpacity)
        .moveTo(backstage.x, backstage.y)
        .lineTo(backstage.x, backstage.y + backstage.height);
      this.overlayContainer.addChild(area);
      this.overlayContainer.addChild(this.createLabel(game.i18n.localize("VISTA.BackstageLabel"), backstage));
    }
  }

  /**
   * Creates a label placed at the top left of an area.
   * @param {string} label - The label text.
   * @param {StripBounds} bounds - The labelled area.
   * @returns {PIXI.Text}
   */
  createLabel(label, bounds) {
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
    return text;
  }
}

/**
 * Extends a token HUD class so its controls keep their normal size on Vista scenes,
 * where the canvas is zoomed far out to fit the scaled-up tokens.
 * @param {typeof foundry.applications.hud.TokenHUD} Base - The configured token HUD class.
 */
function VistaTokenHUDMixin(Base) {
  return class VistaTokenHUD extends Base {
    /** @param {foundry.applications.api.ApplicationV2.Position} position */
    _updatePosition(position) {
      const updated = super._updatePosition(position);
      if (!VistaConfig.get(canvas.scene).enabled) return updated;

      // The HUD container is scaled with the canvas zoom, so scale this HUD by the inverse, shrinking
      // its box to match so it still covers the token.
      const baseScale = updated.scale ?? 1;
      const scale = baseScale / (canvas.stage?.scale.x ?? 1);
      const ratio = baseScale / scale;
      return { ...updated, width: Number(updated.width) * ratio, height: Number(updated.height) * ratio, scale };
    }
  };
}

/**
 * Vista Module Logic
 */
class VistaModule {
  // Token move animations use fixed durations, as scaled-up tokens travel far at Foundry's default speed.
  /** Duration of the slide to where a token is dropped. */
  static DROP_ANIMATION_MS = 250;
  /** Duration of the slide into a token's place in its strip. */
  static ARRANGE_ANIMATION_MS = 500;

  constructor() {
    this.isPanLocking = false;
    /** @type {WeakMap<Token, foundry.canvas.containers.PreciseText>} */
    this.statusTexts = new WeakMap();
    /** @type {PIXI.Texture | null} */
    this.backgroundTexture = null;
    /** @type {PIXI.Texture[]} */
    this.backgroundCrops = [];
    /** @type {foundry.canvas.primary.PrimarySpriteMesh | null} */
    this.backgroundMesh = null;
    this.arrangeTokensDebounced = foundry.utils.debounce(
      this.arrangeTokens.bind(this), 50
    );
  }

  /**
   * Initializes the module.
   */
  init() {
    console.log(`${VistaConfig.ID} | Initializing Vista - Theater of the Mind Strips`);
    this.registerTokenHUD();
    this.registerSettings();
    this.registerKeybindings();
    this.registerSceneConfigTab();
    this.registerHooks();
  }

  /**
   * Replaces the token HUD with one that keeps its normal size on Vista scenes.
   */
  registerTokenHUD() {
    const VistaTokenHUD = VistaTokenHUDMixin(/** @type {typeof foundry.applications.hud.TokenHUD} */ (CONFIG.Token.hudClass));
    CONFIG.Token.hudClass = VistaTokenHUD;
    // The token HUD is created before modules initialize, so the existing instance is replaced too.
    const hudContainer = game.canvas.hud;
    if (hudContainer) hudContainer.token = new VistaTokenHUD();
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
   * Adds a Vista tab to the Scene Configuration dialog, filled in by {@link VistaModule#injectSceneConfig}.
   */
  registerSceneConfigTab() {
    foundry.applications.sheets.SceneConfig.TABS.sheet.tabs.push({
      id: VistaConfig.ID,
      icon: "fa-solid fa-masks-theater",
      label: "VISTA.Tab",
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
      if (!this.isActive()) return;
      this.lockViewport();
      for (const token of canvas.tokens?.placeables ?? []) this.refreshStatus(token);
      this.refreshBackground();
      if (canvas.tokens?.hud.rendered) canvas.tokens.hud.setPosition();
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

    Hooks.on("drawToken", (token) => {
      this.drawStatus(token);
    });

    Hooks.on("deleteToken", () => {
      if (this.isActive()) this.arrangeTokensDebounced();
    });

    Hooks.on("preCreateToken", (tokenDoc) => {
      return this.preCreateToken(tokenDoc);
    });

    Hooks.on("preMoveToken", (tokenDoc, movement, operation) => {
      this.preMoveToken(tokenDoc, movement, operation);
    });

    Hooks.on("preUpdateScene", (scene, updateData) => {
      return this.preUpdateScene(scene, updateData);
    });

    Hooks.once("ready", () => {
      const sidebar = document.getElementById("sidebar");
      // Observing the size follows the sidebar as it animates, which the collapseSidebar hook fires before.
      if (sidebar) new ResizeObserver(() => this.lockViewport()).observe(sidebar);
    });

    Hooks.on("preUpdateToken", (tokenDoc, changes, options) => {
      return this.preUpdateToken(tokenDoc, changes, options);
    });

    Hooks.on("refreshToken", (token) => {
      this.refreshStatus(token);
    });

    Hooks.on("renderSceneConfig", (app, html) => {
      return this.injectSceneConfig(app, html);
    });

    Hooks.on("renderTokenHUD", (hud, html) => {
      this.injectStatusField(hud, html);
    });

    Hooks.on("updateActor", (actor, changes) => {
      const resized = ["width", "height"].some((key) => foundry.utils.hasProperty(changes, `prototypeToken.${key}`));
      if (this.isActive() && resized) this.arrangeTokensDebounced();
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
   * fvtt-types omits the zoom limits in `scale` and the text scale in `uiScale`, so they are added to the type here.
   * @returns {CanvasDimensions}
   */
  get dimensions() {
    return /** @type {CanvasDimensions} */ (canvas.dimensions);
  }

  /**
   * The Vista canvas layer, which Foundry exposes as `canvas.vista` once the canvas is drawn.
   * fvtt-types cannot be extended with custom canvas layer properties, hence the cast.
   * @returns {VistaLayer | undefined}
   */
  get layer() {
    return /** @type {{ vista?: VistaLayer }} */ (/** @type {unknown} */ (canvas)).vista;
  }

  /**
   * The Vista background layer, exposed as `canvas.vistaBackground` like {@link VistaModule#layer}.
   * @returns {VistaBackgroundLayer | undefined}
   */
  get backgroundLayer() {
    return /** @type {{ vistaBackground?: VistaBackgroundLayer }} */ (/** @type {unknown} */ (canvas)).vistaBackground;
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
    this.loadBackground();
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
    this.loadBackground();
    for (const token of canvas.tokens?.placeables ?? []) token.renderFlags.set({ refreshState: true });
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
    const statusPath = `flags.${VistaConfig.ID}.${VistaConfig.FLAG_TOKEN_STATUS}`;
    if (foundry.utils.hasProperty(changes, statusPath)) tokenDoc.object?.renderFlags.set({ refreshState: true });
    if (this.isArrangement(options)) return;
    if (!["x", "y", "width", "height"].some((key) => key in changes)) return;
    this.arrangeTokensDebounced();
  }

  /**
   * Handler for the preCreateToken hook.
   * Places the new token in the strip or backstage it was dropped on.
   * @param {TokenDocument.Implementation} tokenDoc - The token document being created.
   */
  preCreateToken(tokenDoc) {
    if (!this.isActive() || tokenDoc.parent !== canvas.scene) return;
    tokenDoc.updateSource(this.getPlacementChanges(tokenDoc, tokenDoc));
  }

  /**
   * Handler for the preMoveToken hook.
   * Prevents tokens from turning toward the drag direction, since strips have no facing,
   * and shortens the move animation to {@link VistaModule.DROP_ANIMATION_MS}.
   * @param {TokenDocument.Implementation} tokenDoc - The token document being moved.
   * @param {VistaMovement} movement - The pending movement.
   * @param {TokenDocument.Database.Update} operation - The update operation.
   */
  preMoveToken(tokenDoc, movement, operation) {
    if (!this.isActive() || tokenDoc.parent !== canvas.scene) return;
    movement.autoRotate = false;

    // Foundry turns an animation duration into a speed before this hook runs, so set the speed directly.
    const { origin, destination } = movement;
    const distance = Math.hypot(destination.x - origin.x, destination.y - origin.y) / this.dimensions.size;
    if (distance > 0) {
      const movementSpeed = distance / (VistaModule.DROP_ANIMATION_MS / 1000);
      operation.animation = { ...operation.animation, movementSpeed };
    }
  }

  /**
   * Handler for the preUpdateToken hook.
   * Reassigns the strip or backstage in the same update as a manual move.
   * @param {TokenDocument.Implementation} tokenDoc - The token document being updated.
   * @param {TokenDocument.UpdateData} changes - The pending changes.
   * @param {TokenDocument.Database.PreUpdateOptions} options - The update options.
   */
  preUpdateToken(tokenDoc, changes, options) {
    if (!this.isActive() || tokenDoc.parent !== canvas.scene || this.isArrangement(options)) return;

    if (typeof changes.x === "number" || typeof changes.y === "number") {
      const placement = this.getPlacementChanges(tokenDoc, {
        x: changes.x ?? tokenDoc.x,
        y: changes.y ?? tokenDoc.y,
        width: changes.width ?? tokenDoc.width,
        height: changes.height ?? tokenDoc.height,
      });
      for (const [path, value] of Object.entries(placement)) foundry.utils.setProperty(changes, path, value);
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
   * Calculates the bounding box for a specific strip within the padded scene area.
   * @param {number} stripIndex - The index of the strip.
   * @param {VistaSceneConfig} config - The scene's Vista configuration.
   * @returns {StripBounds} The bounding box.
   */
  getStripBounds(stripIndex, { stripCount, padLeft, padRight, sideBySide }) {
    const { sceneRect } = this.dimensions;
    const area = {
      x: sceneRect.x + padLeft,
      y: sceneRect.y,
      width: sceneRect.width - padLeft - padRight,
      height: sceneRect.height,
    };

    if (sideBySide) {
      const stripWidth = area.width / stripCount;
      return { ...area, x: area.x + stripIndex * stripWidth, width: stripWidth };
    }
    const stripHeight = area.height / stripCount;
    return { ...area, y: area.y + stripIndex * stripHeight, height: stripHeight };
  }

  /**
   * Determines which strip contains the center of a token.
   * @param {TokenTarget} token - The token's position and size.
   * @returns {number} The strip index.
   */
  getStripIndexForToken({ x, y, width, height }) {
    const config = VistaConfig.get(canvas.scene);
    const gridSize = this.dimensions.size;
    const first = this.getStripBounds(0, config);
    const offset = config.sideBySide
      ? (x + (width * gridSize) / 2 - first.x) / first.width
      : (y + (height * gridSize) / 2 - first.y) / first.height;
    return Math.clamp(Math.floor(offset), 0, config.stripCount - 1);
  }

  /**
   * Calculates the GM-only backstage area, which fills the canvas padding right of the scene.
   * @param {VistaSceneConfig} config - The scene's Vista configuration.
   * @returns {StripBounds | null} The backstage area, or null if the scene has none.
   */
  getBackstageBounds(config) {
    if (!config.backstage) return null;
    const { rect, sceneRect } = this.dimensions;
    const width = rect.right - sceneRect.right;
    if (width <= 0) return null;
    return { x: sceneRect.right, y: sceneRect.y, width, height: sceneRect.height };
  }

  /**
   * Builds the flag changes that place a token in the strip or backstage under its center.
   * Tokens are hidden when entering backstage and revealed when leaving it, but tokens hidden
   * for other reasons are never revealed.
   * @param {TokenDocument.Implementation} tokenDoc - The token document.
   * @param {TokenTarget} position - The token's new position and size.
   * @returns {Record<string, unknown>} Changes keyed by property path.
   */
  getPlacementChanges(tokenDoc, position) {
    const backstage = this.getBackstageBounds(VistaConfig.get(canvas.scene));
    const centerX = position.x + (position.width * this.dimensions.size) / 2;
    const inBackstage = !!backstage && centerX >= backstage.x;
    const wasInBackstage = tokenDoc.getFlag(VistaConfig.ID, VistaConfig.FLAG_TOKEN_BACKSTAGE) ?? false;

    /** @type {Record<string, unknown>} */
    const changes = { [`flags.${VistaConfig.ID}.${VistaConfig.FLAG_TOKEN_BACKSTAGE}`]: inBackstage };
    if (!inBackstage) changes[`flags.${VistaConfig.ID}.${VistaConfig.FLAG_TOKEN_STRIP}`] = this.getStripIndexForToken(position);
    if (inBackstage !== wasInBackstage) changes.hidden = inBackstage;
    return changes;
  }

  /**
   * Whether a token is backstage on a scene that has a backstage area.
   * @param {TokenDocument.Implementation} tokenDoc - The token document.
   * @param {VistaSceneConfig} config - The scene's Vista configuration.
   * @returns {boolean}
   */
  isBackstage(tokenDoc, config) {
    return config.backstage && (tokenDoc.getFlag(VistaConfig.ID, VistaConfig.FLAG_TOKEN_BACKSTAGE) ?? false);
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
   * Retrieves a token's unscaled size in grid units, taken from its actor's prototype token
   * because the layout overwrites the token's own size.
   * @param {TokenDocument.Implementation} tokenDoc - The token document.
   * @returns {TokenSize} The base size.
   */
  getTokenBaseSize(tokenDoc) {
    const prototype = tokenDoc.actor?.prototypeToken;
    return { width: prototype?.width ?? 1, height: prototype?.height ?? 1 };
  }

  /**
   * Assigns every token in the scene to the strip under its current position.
   */
  async assignStripsFromPositions() {
    const scene = canvas.scene;
    if (!scene || !game.users.activeGM?.isSelf) return;
    const updates = scene.tokens.map((tokenDoc) => ({ _id: tokenDoc.id, ...this.getPlacementChanges(tokenDoc, tokenDoc) }));
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
   * The width of the screen left of the sidebar, which covers the right of the canvas.
   * @returns {number}
   */
  getFreeScreenWidth() {
    const sidebarLeft = document.getElementById("sidebar")?.getBoundingClientRect().left ?? window.innerWidth;
    return Math.min(sidebarLeft, window.innerWidth);
  }

  /**
   * Locks the viewport to fit and center the scene in the area left of the sidebar.
   * The GM's view also includes the backstage area.
   */
  lockViewport() {
    if (!this.isActive() || this.isPanLocking) return;
    this.debug("Locking viewport");
    this.isPanLocking = true;

    const { sceneRect: scene, scale: zoomLimits } = this.dimensions;
    const backstage = game.user.isGM ? this.getBackstageBounds(VistaConfig.get(canvas.scene)) : null;
    const sceneRect = new PIXI.Rectangle(scene.x, scene.y, scene.width + (backstage?.width ?? 0), scene.height);
    const availableWidth = this.getFreeScreenWidth();
    const scale = Math.min(
      availableWidth / sceneRect.width,
      window.innerHeight / sceneRect.height
    );
    // Foundry's minimum zoom fits the scene to the whole window, so it can't fit the area beside the sidebar.
    zoomLimits.min = Math.min(zoomLimits.min, scale);

    // canvas.pan centers on the whole window, so shift by half the covered width to center on the free area.
    const coveredWidth = window.innerWidth - availableWidth;
    canvas.pan({ x: sceneRect.center.x + coveredWidth / 2 / scale, y: sceneRect.center.y, scale });
    requestAnimationFrame(() => { this.isPanLocking = false; });
  }

  // ─── Token Layout & Updates ───

  /**
   * Calculates the target layout for all tokens in the scene.
   * Separates layout logic from document update logic.
   * @returns {Map<string, TokenTarget>} Map of token ID to its target.
   */
  calculateTokenTargets() {
    const config = VistaConfig.get(canvas.scene);
    const { stripCount } = config;
    const tokens = canvas.tokens?.placeables ?? [];
    const onStage = tokens.filter((token) => !this.isBackstage(token.document, config));
    /** @type {Map<string, TokenTarget>} */
    const targets = new Map();

    /**
     * @param {Token[]} sorted - The area's tokens in display order.
     * @param {StripBounds} bounds - The area to lay them out in.
     */
    const layOut = (sorted, bounds) => {
      const sizes = sorted.map((token) => this.getTokenBaseSize(token.document));
      this.layoutStrip(sizes, bounds).forEach((target, index) => targets.set(sorted[index].id, target));
    };

    for (let i = 0; i < stripCount; i++) {
      const sorted = this.getSortedTokensForStrip(onStage, i, stripCount);
      if (sorted.length) layOut(sorted, this.getStripBounds(i, config));
    }

    const backstage = this.getBackstageBounds(config);
    const backstageTokens = tokens.filter((token) => this.isBackstage(token.document, config));
    if (backstage && backstageTokens.length) layOut(this.sortTokens(backstageTokens), backstage);

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
    const stripTokens = tokens.filter((t) => this.getTokenStrip(t.document, stripCount) === stripIndex);
    return this.sortTokens(stripTokens);
  }

  /**
   * Sorts tokens by combat turn (if active) or alphabetically, in place.
   * @param {Token[]} tokens - Array of token placeables.
   * @returns {Token[]} The sorted array.
   */
  sortTokens(tokens) {
    const combat = game.combat;
    const inCombat = combat?.started;

    if (!inCombat) {
      tokens.sort((a, b) => (a.document.name ?? "").localeCompare(b.document.name ?? ""));
      return tokens;
    }

    const tokenIdToTurnIndex = new Map();
    combat.turns.forEach((turn, index) => tokenIdToTurnIndex.set(turn.tokenId, index));

    tokens.sort((a, b) => {
      const turnIndexA = tokenIdToTurnIndex.get(a.id);
      const turnIndexB = tokenIdToTurnIndex.get(b.id);
      if (turnIndexA !== undefined && turnIndexB !== undefined) return turnIndexA - turnIndexB;
      if (turnIndexA !== undefined) return -1;
      if (turnIndexB !== undefined) return 1;
      return (a.document.name ?? "").localeCompare(b.document.name ?? "");
    });

    return tokens;
  }

  /**
   * Main orchestrator function: Calculates layout, compares with current state, and applies updates.
   */
  async arrangeTokens() {
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
      // Built apart from the call so TypeScript accepts the custom vistaArrangement option.
      const options = { vistaArrangement: true, animation: { duration: VistaModule.ARRANGE_ANIMATION_MS } };
      await scene.updateEmbeddedDocuments("Token", updates, options);
    }
  }

  // ─── Visuals ───

  /**
   * Loads the scene's background image, or clears it when the scene has none.
   */
  async loadBackground() {
    const { enabled, background } = VistaConfig.get(canvas.scene);
    const loaded = enabled && background ? await foundry.canvas.loadTexture(background) : null;
    this.backgroundTexture = loaded instanceof PIXI.Texture ? loaded : null;
    this.refreshBackground();
  }

  /**
   * Fits the background image to the area this viewer sees, scaling it to cover the area without
   * stretching. The mesh inside the canvas stops where the GM's backstage begins, so the backstage keeps
   * the canvas's own dark color, while the layer beneath still fills the margins around it.
   */
  refreshBackground() {
    const texture = this.backgroundTexture;
    const mesh = this.getBackgroundMesh();
    const sprite = this.backgroundLayer?.sprite;
    const visible = !!texture && this.isActive();
    for (const target of [mesh, sprite]) if (target) target.visible = visible;
    if (!texture || !visible) return;

    const area = this.getBackgroundArea();
    const scale = Math.max(area.width / texture.width, area.height / texture.height);
    // Where the texture's top left corner lands on the canvas once centered over the area.
    const originX = area.x - (texture.width * scale - area.width) / 2;
    const originY = area.y - (texture.height * scale - area.height) / 2;

    const previousCrops = this.backgroundCrops;
    this.backgroundCrops = [];
    /**
     * @param {PIXI.Sprite | foundry.canvas.primary.PrimarySpriteMesh | null | undefined} target - The sprite to place.
     * @param {PIXI.Rectangle} rect - The canvas area it covers, within the background area.
     */
    const place = (target, rect) => {
      if (!target) return;
      const frame = new PIXI.Rectangle((rect.x - originX) / scale, (rect.y - originY) / scale, rect.width / scale, rect.height / scale);
      const crop = new PIXI.Texture(texture.baseTexture, frame);
      this.backgroundCrops.push(crop);
      target.texture = crop;
      target.position.set(rect.x, rect.y);
      target.width = rect.width;
      target.height = rect.height;
    };

    const backstage = game.user.isGM ? this.getBackstageBounds(VistaConfig.get(canvas.scene)) : null;
    const meshArea = backstage ? new PIXI.Rectangle(area.x, area.y, backstage.x - area.x, area.height) : area;
    place(sprite, area);
    place(mesh, meshArea);
    for (const crop of previousCrops) crop.destroy();
  }

  /**
   * The background mesh in the primary group, which is recreated after each canvas draw tears it down.
   * @returns {foundry.canvas.primary.PrimarySpriteMesh | null}
   */
  getBackgroundMesh() {
    if (!canvas.primary) return null;
    if (this.backgroundMesh && !this.backgroundMesh.destroyed) return this.backgroundMesh;

    const mesh = new foundry.canvas.primary.PrimarySpriteMesh({ name: "vistaBackground" });
    mesh.sortLayer = foundry.canvas.groups.PrimaryCanvasGroup.SORT_LAYERS.SCENE;
    // Just above the scene's own background, which sorts at zIndex -Infinity.
    mesh.zIndex = Number.MIN_SAFE_INTEGER;
    this.backgroundMesh = canvas.primary.addChild(mesh);
    return mesh;
  }

  /**
   * The canvas area this viewer sees, including under the sidebar, whose tab buttons don't fully cover
   * the canvas.
   * @returns {PIXI.Rectangle}
   */
  getBackgroundArea() {
    const stage = /** @type {PIXI.Container} */ (canvas.stage);
    const topLeft = stage.toLocal(new PIXI.Point(0, 0));
    const bottomRight = stage.toLocal(new PIXI.Point(window.innerWidth, window.innerHeight));
    return new PIXI.Rectangle(topLeft.x, topLeft.y, bottomRight.x - topLeft.x, bottomRight.y - topLeft.y);
  }

  /**
   * Handler for the drawToken hook.
   * Adds the text object that shows the token's status line.
   * @param {Token} token - The drawn token.
   */
  drawStatus(token) {
    const text = new foundry.canvas.containers.PreciseText("", this.getStatusStyle(token, 1));
    text.anchor.set(0.5, 0);
    token.addChild(text);
    this.statusTexts.set(token, text);
  }

  /**
   * Handler for the refreshToken hook.
   * Updates the status line and keeps it below the token's name.
   * @param {Token} token - The refreshed token.
   */
  refreshStatus(token) {
    const text = this.statusTexts.get(token);
    if (!text) return;

    const status = token.document.getFlag(VistaConfig.ID, VistaConfig.FLAG_TOKEN_STATUS) ?? "";
    text.visible = !!status && this.isActive() && !token.document.isSecret;
    if (!text.visible) return;

    const { width, height } = token.document.getSize();
    const nameplateHeight = token.nameplate?.visible ? token.nameplate.height : 0;
    // Kept at a fixed size on screen, since Vista zooms far out to fit its large tokens.
    const textScale = this.dimensions.uiScale / (canvas.stage?.scale.x ?? 1);
    text.text = status;
    text.style = this.getStatusStyle(token, textScale);
    text.scale.set(textScale, textScale);
    text.position.set(width / 2, height + 2 + nameplateHeight);
  }

  /**
   * The status line's text style: Foundry's token text, but italic and dimmer than the name.
   * @param {Token} token - The token the status belongs to.
   * @param {number} textScale - The scale the text is drawn at.
   * @returns {PIXI.TextStyle}
   */
  getStatusStyle(token, textScale) {
    const style = CONFIG.canvasTextStyle.clone();
    style.fontSize = 20;
    style.fontStyle = "italic";
    style.fill = "#d0d0d0";
    style.wordWrapWidth = (token.w * 2.5) / textScale;
    return style;
  }

  /**
   * Handler for the renderTokenHUD hook.
   * Adds a field for editing the token's status line on Vista scenes.
   * @param {foundry.applications.hud.TokenHUD} hud - The token HUD.
   * @param {HTMLElement} html - The HUD element.
   */
  injectStatusField(hud, html) {
    const tokenDoc = hud.document;
    if (!this.isActive() || !tokenDoc) return;

    const input = document.createElement("input");
    input.type = "text";
    input.value = tokenDoc.getFlag(VistaConfig.ID, VistaConfig.FLAG_TOKEN_STATUS) ?? "";
    input.placeholder = game.i18n.localize("VISTA.StatusPlaceholder");
    input.addEventListener("change", (event) => {
      // Kept out of the HUD's form handling, which would parse the text as a number.
      event.stopPropagation();
      tokenDoc.setFlag(VistaConfig.ID, VistaConfig.FLAG_TOKEN_STATUS, input.value.trim());
    });

    const field = document.createElement("div");
    field.className = "vista-status";
    field.dataset.tooltip = "VISTA.Status";
    field.append(input);
    html.append(field);
  }

  /**
   * Draws the overlay lines and labels.
   */
  drawOverlay() {
    if (!canvas?.ready) return;

    const config = VistaConfig.get(canvas.scene);
    this.layer?.renderStrips(config, this);
  }

  /**
   * Fills the Vista tab of the Scene Configuration dialog.
   * @param {foundry.applications.sheets.SceneConfig} app - The app instance.
   * @param {HTMLElement} html - The HTML content.
   */
  injectSceneConfig(app, html) {
    // The tab is not one of the sheet's parts, so it is rebuilt on each render to avoid stale values.
    html.querySelector(`.tab[data-group="sheet"][data-tab="${VistaConfig.ID}"]`)?.remove();

    const { createFormGroup, createCheckboxInput, createNumberInput, createTextInput } = foundry.applications.fields;
    const flags = VistaConfig.get(app.document);
    const name = (/** @type {string} */ flag) => `flags.${VistaConfig.ID}.${flag}`;
    const group = (/** @type {string} */ label, /** @type {string} */ hint, /** @type {HTMLElement} */ input) =>
      createFormGroup({ label, hint, input, rootId: app.id, localize: true });

    const tab = document.createElement("div");
    tab.className = "tab scrollable";
    tab.classList.toggle("active", app.tabGroups.sheet === VistaConfig.ID);
    tab.dataset.group = "sheet";
    tab.dataset.tab = VistaConfig.ID;

    tab.append(
      group("VISTA.EnableStrips", "VISTA.EnableStripsHint", createCheckboxInput({
        name: name(VistaConfig.FLAG_ENABLED),
        value: flags.enabled,
      })),
      group("VISTA.StripCount", "VISTA.StripCountHint", createNumberInput({
        name: name(VistaConfig.FLAG_STRIP_COUNT),
        value: flags.stripCount,
        min: 1,
        max: 4,
        step: 1,
      })),
      group("VISTA.SideBySide", "VISTA.SideBySideHint", createCheckboxInput({
        name: name(VistaConfig.FLAG_SIDE_BY_SIDE),
        value: flags.sideBySide,
      })),
      group("VISTA.Backstage", "VISTA.BackstageHint", createCheckboxInput({
        name: name(VistaConfig.FLAG_BACKSTAGE),
        value: flags.backstage,
      })),
      group("VISTA.Background", "VISTA.BackgroundHint", foundry.applications.elements.HTMLFilePickerElement.create({
        name: name(VistaConfig.FLAG_BACKGROUND),
        value: flags.background,
        type: "image",
      })),
      group("VISTA.StripLabels", "VISTA.StripLabelsHint", createTextInput({
        name: name(VistaConfig.FLAG_STRIP_LABELS),
        value: flags.stripLabels.join(", "),
        placeholder: game.i18n.localize("VISTA.StripLabelsPlaceholder"),
      })),
      group("VISTA.ShowStripLines", "VISTA.ShowStripLinesHint", createCheckboxInput({
        name: name(VistaConfig.FLAG_STRIP_LINES_VISIBLE),
        value: flags.stripLinesVisible,
      })),
      group("VISTA.PadLeft", "VISTA.PadLeftHint", createNumberInput({
        name: name(VistaConfig.FLAG_PAD_LEFT),
        value: flags.padLeft,
        min: 0,
        step: 10,
      })),
      group("VISTA.PadRight", "VISTA.PadRightHint", createNumberInput({
        name: name(VistaConfig.FLAG_PAD_RIGHT),
        value: flags.padRight,
        min: 0,
        step: 10,
      })),
    );

    html.querySelector(".form-footer")?.before(tab);
  }

  /**
   * Pre-update handler for scene changes.
   * Processes string input for labels into an array, and adds padding for a new backstage area.
   * @param {Scene.Implementation} scene - The scene document.
   * @param {Scene.UpdateData} updateData - The update data.
   */
  preUpdateScene(scene, updateData) {
    const BACKSTAGE_PADDING = 0.1;

    const labelPath = `flags.${VistaConfig.ID}.${VistaConfig.FLAG_STRIP_LABELS}`;
    const raw = foundry.utils.getProperty(updateData, labelPath);
    if (typeof raw === "string") {
      const arr = raw.split(",").map((s) => s.trim()).filter(Boolean);
      foundry.utils.setProperty(updateData, labelPath, arr);
    }

    // The backstage area lives in the scene's padding, so it needs some to exist.
    const backstagePath = `flags.${VistaConfig.ID}.${VistaConfig.FLAG_BACKSTAGE}`;
    const padding = updateData.padding ?? scene.padding;
    if (foundry.utils.getProperty(updateData, backstagePath) === true && !padding) {
      updateData.padding = BACKSTAGE_PADDING;
    }
  }
}

const vista = new VistaModule();
Hooks.once("init", () => {
  CONFIG.Canvas.layers.vista = {
    group: "interface",
    layerClass: VistaLayer
  };
  CONFIG.Canvas.layers.vistaBackground = {
    group: "rendered",
    layerClass: VistaBackgroundLayer
  };

  vista.init()
});
