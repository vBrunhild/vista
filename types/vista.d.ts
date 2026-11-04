export {};

declare module "fvtt-types/configuration" {
  // Vista only runs from the init hook onward, and touches the canvas only once it is ready.
  interface AssumeHookRan {
    ready: never;
  }

  interface SettingConfig {
    "vista.debugMode": boolean;
    "vista.lineColor": foundry.data.fields.ColorField<{ nullable: false; initial: "#000000" }>;
    "vista.lineThickness": number;
    "vista.lineOpacity": number;
    "vista.defaultPadLeft": number;
    "vista.defaultPadRight": number;
    "vista.defaultStripLinesVisible": boolean;
  }

  interface FlagConfig {
    Scene: {
      vista: {
        enabled?: boolean;
        stripCount?: number;
        stripLabels?: string[];
        padLeft?: number;
        padRight?: number;
        stripLinesVisible?: boolean;
      };
    };
    Token: {
      vista: {
        stripIndex?: number;
        baseSize?: { width: number; height: number };
      };
    };
  }

  namespace Hooks {
    // Core v13 hook that the pinned fvtt-types does not declare yet.
    interface HookConfig {
      preMoveToken: (
        document: TokenDocument.Implementation,
        movement: { autoRotate: boolean; showRuler: boolean },
        operation: TokenDocument.Database.Update,
      ) => boolean | void;
    }
  }
}

declare global {
  namespace CONFIG {
    namespace Canvas {
      interface Layers {
        vista: CONFIG.Canvas.LayerDefinition<typeof VistaLayer, "interface">;
      }
    }
  }
}
