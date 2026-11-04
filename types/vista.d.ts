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
        sideBySide?: boolean;
        backstage?: boolean;
        background?: string;
      };
    };
    Token: {
      vista: {
        stripIndex?: number;
        inBackstage?: boolean;
        status?: string;
      };
    };
  }

  namespace Hooks {
    // Core v13 hook that the pinned fvtt-types does not declare yet.
    interface HookConfig {
      preMoveToken: (
        document: TokenDocument.Implementation,
        movement: {
          autoRotate: boolean;
          showRuler: boolean;
          readonly origin: { readonly x: number; readonly y: number };
          readonly destination: { readonly x: number; readonly y: number };
        },
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
        vistaBackground: CONFIG.Canvas.LayerDefinition<typeof VistaBackgroundLayer, "rendered">;
      }
    }
  }
}
