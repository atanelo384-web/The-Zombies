# Converts selected Kenney CC0 sounds into js/sounds_data.js (base64, mono mp3)
import subprocess, base64, os, sys, json
K = sys.argv[1]  # path to kenney checkout
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'js', 'sounds_data.js')
I, R, U, IM = K + '/kenney_interfacesounds/Audio/', K + '/kenney_rpgaudio/Audio/', K + '/kenney_uiaudio/Audio/', K + '/kenney_impactsounds/Audio/'
S = {}
for surf in ['grass', 'snow', 'wood', 'concrete', 'carpet']:
    S['step_' + surf] = [IM + f'footstep_{surf}_00{i}.ogg' for i in range(5)]
S['hit_wood'] = [IM + f'impactWood_heavy_00{i}.ogg' for i in range(4)]
S['hit_metal'] = [IM + f'impactMetal_heavy_00{i}.ogg' for i in range(4)]
S['hit_stone'] = [IM + f'impactMining_00{i}.ogg' for i in range(4)]
S['mine'] = [IM + f'impactMining_00{i}.ogg' for i in range(5)]
S['punch'] = [IM + f'impactPunch_heavy_00{i}.ogg' for i in range(4)]
S['flesh'] = [IM + f'impactSoft_heavy_00{i}.ogg' for i in range(4)]
S['plank'] = [IM + f'impactPlank_medium_00{i}.ogg' for i in range(4)]
S['plate'] = [IM + f'impactPlate_heavy_00{i}.ogg' for i in range(3)]
S['glass'] = [IM + f'impactGlass_heavy_00{i}.ogg' for i in range(3)]
S['tin'] = [IM + f'impactTin_medium_00{i}.ogg' for i in range(3)]
S['chop'] = [R + 'chop.ogg']
S['cloth'] = [R + f'cloth{i}.ogg' for i in range(1, 5)]
S['door_open'] = [R + 'doorOpen_1.ogg', R + 'doorOpen_2.ogg']
S['door_close'] = [R + 'doorClose_1.ogg', R + 'doorClose_2.ogg']
S['creak'] = [R + f'creak{i}.ogg' for i in range(1, 4)]
S['knife_draw'] = [R + f'drawKnife{i}.ogg' for i in range(1, 4)]
S['slash'] = [R + 'knifeSlice.ogg', R + 'knifeSlice2.ogg']
S['metal_click'] = [R + 'metalClick.ogg']
S['latch'] = [R + 'metalLatch.ogg']
S['pickup'] = [R + 'handleSmallLeather.ogg', R + 'handleSmallLeather2.ogg']
S['drop'] = [R + 'dropLeather.ogg']
S['belt'] = [R + 'beltHandle1.ogg', R + 'beltHandle2.ogg']
S['pot'] = [R + f'metalPot{i}.ogg' for i in range(1, 4)]
S['book'] = [R + 'bookFlip1.ogg', R + 'bookFlip2.ogg']
S['ui_click'] = [I + 'click_002.ogg']
S['ui_select'] = [I + 'select_002.ogg']
S['ui_hover'] = [U + 'rollover2.ogg']
S['ui_open'] = [I + 'open_002.ogg']
S['ui_close'] = [I + 'close_002.ogg']
S['ui_confirm'] = [I + 'confirmation_002.ogg']
S['ui_error'] = [I + 'error_006.ogg']
S['ui_switch'] = [I + 'switch_002.ogg']
S['ui_toggle'] = [I + 'toggle_002.ogg']
S['ui_tick'] = [I + 'tick_002.ogg']
S['ui_drop'] = [I + 'drop_002.ogg']
S['ui_back'] = [I + 'back_002.ogg']
S['ui_max'] = [I + 'maximize_006.ogg']
S['ui_scroll'] = [I + 'scroll_002.ogg']
data = {}
total = 0
for name, files in S.items():
    arr = []
    for f in files:
        r = subprocess.run(['ffmpeg', '-v', 'error', '-i', f, '-ac', '1', '-ar', '22050', '-b:a', '48k', '-f', 'mp3', '-'], capture_output=True)
        if r.returncode or not r.stdout: print('fail', f, r.stderr[:200]); continue
        arr.append(base64.b64encode(r.stdout).decode()); total += len(r.stdout)
    data[name] = arr
with open(OUT, 'w') as fh:
    fh.write('// Sound effects by Kenney (www.kenney.nl), CC0 1.0 — converted to mono MP3.\n')
    fh.write('TZ.SOUND_DATA = ' + json.dumps(data, separators=(',', ':')) + ';\n')
print('sounds', len(data), 'bytes', total, 'js', os.path.getsize(OUT))
