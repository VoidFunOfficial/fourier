// This saved native export is independent of the established hybrid model.
import source from "./cubism-native/PastelCatgirl-native-lively.moc3";
import { voidavatarNativeParameterMap } from "./native-controls.ts";

// The bundled MOC is still v2. Body/cat/sleeve mappings are ready for the next
// native export; missing IDs stay inactive, and existing IDs need its new forms.
// Unmapped parameters retain the MOC defaults. The importer loads geometry and
// textures; it does not execute physics3, exp3 or motion3 files from the manifest.
export const voidavatarNativeSource = Object.freeze({ ...source, parameterMap: voidavatarNativeParameterMap });
