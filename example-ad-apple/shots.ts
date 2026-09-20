export const SHOTS = [
 {id:'01-outline',seconds:3},{id:'02-object',seconds:3},{id:'03-footprint',seconds:3},
 {id:'04-silicon',seconds:4},{id:'05-cpu',seconds:4},{id:'06-gpu',seconds:4},
 {id:'07-neural',seconds:4},{id:'08-memory',seconds:4},{id:'09-bandwidth',seconds:4},
 {id:'10-media',seconds:4},{id:'11-front',seconds:4},{id:'12-back',seconds:4},
 {id:'13-wireless',seconds:4},{id:'14-thermal',seconds:3},{id:'15-displays',seconds:4},
 {id:'16-continuity',seconds:4},{id:'17-create',seconds:2},{id:'18-signature',seconds:4},
 {id:'19-all-in',seconds:5},{id:'20-credits',seconds:4},
] as const;

export function sceneDirectory(id: string) {
 return `${Number(id.slice(0, 2)) >= 18 ? 'templates/ending/scenes' : 'scenes'}/${id}`;
}
