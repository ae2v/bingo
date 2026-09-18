import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { AlertTriangle, ArrowLeft, BookOpen, Briefcase, CalendarDays, Camera, Check, CircleHelp, Coffee, Compass, Gamepad2, Gift, Grid3X3, LoaderCircle, LogOut, Megaphone, QrCode, Route, School, Search, Settings2, ShieldCheck, Sparkles, Trash2, Trophy, Undo2, UserRound, Users, X } from 'lucide-react';
import { api, ApiError } from './api';
import { listPending, queuePending, removePending } from './outbox';
import { decodeQrFrame } from './qrScanner';

type PublicState = { name: string; date: string; state: 'WAITING'|'RUNNING'|'ENDED'; serverTime: number; prizes: { full: string; raffle: string }; firstFullWinner: string|null; raffleWinners: { firstName: string; position: number; prize: string }[] };
type GridItem = { id: string; position: number; text: string; category: string; difficulty: number; status: 'empty'|'confirmed'|'pending'; validatorFirstName?: string };
type PlayerData = { user: { id: string; eventId: string; firstName: string; lastName: string; firstNormalized: string; codeSecret: string }; state: PublicState; grid: GridItem[]; progress: { validated: number; entries: number; maxEntries: number }; isFirstFullWinner: boolean };

const gridPoints = [
  [[0, .5], [24.7, 0], [50.2, -.2], [75.5, .2], [100.5, .2]],
  [[.3, 24.5], [25, 24.8], [50, 24.9], [75.2, 25], [100.1, 24.6]],
  [[.5, 50.1], [24.7, 50], [50.1, 50.3], [75.4, 50.3], [100, 49.9]],
  [[1, 75.3], [25, 75.1], [49.7, 75.1], [75.2, 75.2], [99.5, 75.5]],
  [[.8, 100.1], [24.3, 100], [50, 100.5], [75.4, 100.2], [99.4, 100.2]]
] as const;

function gridFillPath(position: number) {
  const row = Math.floor(position / 4); const col = position % 4;
  const a = gridPoints[row][col]; const b = gridPoints[row][col + 1]; const c = gridPoints[row + 1][col + 1]; const d = gridPoints[row + 1][col];
  const wobble = ((row + col) % 2 ? .45 : -.45);
  return `M${a[0]} ${a[1]} Q${(a[0] + b[0]) / 2} ${(a[1] + b[1]) / 2 + wobble} ${b[0]} ${b[1]} Q${(b[0] + c[0]) / 2 + wobble} ${(b[1] + c[1]) / 2} ${c[0]} ${c[1]} Q${(c[0] + d[0]) / 2} ${(c[1] + d[1]) / 2 - wobble} ${d[0]} ${d[1]} Q${(d[0] + a[0]) / 2 - wobble} ${(d[1] + a[1]) / 2} ${a[0]} ${a[1]}Z`;
}

function CategoryDoodle({ category }: { category: string }) {
  const props = { 'aria-hidden': true, strokeWidth: 2.7 } as const;
  if (category === 'Filière') return <BookOpen {...props}/>;
  if (category === 'Rentrée') return <CalendarDays {...props}/>;
  if (category === 'Trajet') return <Route {...props}/>;
  if (category === 'Parcours scolaire') return <School {...props}/>;
  if (category === 'Orientation') return <Compass {...props}/>;
  if (category === 'Loisirs') return <Gamepad2 {...props}/>;
  if (category === 'Expérience') return <Briefcase {...props}/>;
  if (category === "Vie à l'IUT") return <Coffee {...props}/>;
  return <Megaphone {...props}/>;
}

function FingerprintStamp({ seed }: { seed: number }) {
  const variant = seed % 3;
  const style = {
    '--finger-rotation': `${[-14, 9, 18, -7][seed % 4]}deg`,
    '--finger-direction': seed % 2 ? -1 : 1,
    '--finger-x': `${[1, -4, 3][variant]}px`
  } as CSSProperties;
  return <span className={`fingerprint-stamp fingerprint-stamp--${variant}`} style={style} aria-hidden="true"><svg viewBox="0 0 64 76">
    {variant === 0 && <><path d="M32 6C16 6 7 17 7 32c0 7 2 11 2 18"/><path d="M32 13c-12 0-19 8-19 20 0 9 4 14 2 27"/><path d="M32 20c-8 0-13 5-13 13 0 12 5 19 0 34"/><path d="M32 27c-4 0-7 3-7 7 0 13 7 22 1 37"/><path d="M32 6c16 0 25 11 25 26 0 16-7 27-7 37"/><path d="M32 13c12 0 19 8 19 20 0 13-7 21-7 34"/><path d="M32 20c8 0 13 5 13 13 0 15-9 23-8 38"/><path d="M32 27c4 0 7 3 7 7 0 14-8 21-8 36"/><path d="M13 39c2 15-1 23-4 28M52 39c-2 13 1 21 3 27"/></>}
    {variant === 1 && <><path d="M31 7C15 8 7 20 8 35c1 13 7 19 2 33"/><path d="M32 14c-11 0-18 8-17 21 1 12 7 18 2 34"/><path d="M32 22c-7 0-11 5-10 14 2 13 7 20 2 35"/><path d="M31 29c-3 0-5 3-5 7 1 12 8 20 4 35"/><path d="M31 7c17 0 26 11 25 28-1 12-8 21-6 34"/><path d="M32 14c12 0 18 8 17 21-1 13-8 21-6 34"/><path d="M32 22c8 0 11 6 10 14-2 12-8 21-6 35"/><path d="M12 29c-1 12 4 18 2 29M53 28c1 12-5 20-4 31"/></>}
    {variant === 2 && <><path d="M33 7C18 5 8 15 7 30c-1 12 4 20 1 34"/><path d="M33 14c-11-1-18 6-19 18-1 12 5 20 1 36"/><path d="M33 21c-8-1-13 4-13 12 0 14 7 21 2 38"/><path d="M33 28c-4 0-7 2-7 7 0 12 8 21 3 36"/><path d="M33 7c15 1 24 12 24 27 0 14-8 23-6 35"/><path d="M33 14c12 1 18 9 18 21 0 12-8 21-6 34"/><path d="M33 21c8 1 12 6 12 14 0 13-8 22-6 36"/><path d="M12 40c2 11-2 19-4 26M54 40c-2 11 1 19 3 26"/></>}
  </svg></span>;
}

function ConfirmFinishModal({ busy, onCancel, onConfirm }: { busy: boolean; onCancel: () => void; onConfirm: () => void }) {
  return <div className="confirm-backdrop" onMouseDown={(event)=>event.target===event.currentTarget&&!busy&&onCancel()}><section className="confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="finish-title"><span className="confirm-dialog__icon"><Trophy/></span><p className="eyebrow">FIN DE PARTIE</p><h2 id="finish-title">Terminer le bingo ?</h2><p>Les validations seront bloquées. Tu pourras ensuite lancer le tirage ou redémarrer la partie si nécessaire.</p><div><button disabled={busy} onClick={onCancel}>Continuer la partie</button><button className="button button--primary" disabled={busy} onClick={onConfirm}>{busy?<LoaderCircle className="spin"/>:<Check/>}Confirmer la fin</button></div></section></div>;
}

function HelpDoodle({ kind }: { kind: 'meet'|'scan'|'line' }) {
  if (kind === 'meet') return <svg className="help-doodle help-doodle--meet" viewBox="0 0 90 70" aria-hidden="true"><circle cx="27" cy="24" r="12"/><circle cx="63" cy="24" r="12"/><path d="M10 62c2-19 8-28 17-28s16 9 18 28M45 62c2-19 9-28 18-28s15 9 17 28"/><path className="help-doodle__accent" d="M39 18c5-7 9-7 14 0M44 13v11"/></svg>;
  if (kind === 'scan') return <svg className="help-doodle help-doodle--scan" viewBox="0 0 90 70" aria-hidden="true"><rect x="15" y="9" width="60" height="52" rx="8"/><path d="M25 25v-7h7M58 18h7v7M32 52h-7v-7M65 45v7h-7"/><path className="help-doodle__accent scan-beam" d="M22 36h46"/><rect x="36" y="27" width="18" height="18" rx="2"/></svg>;
  return <svg className="help-doodle help-doodle--line" viewBox="0 0 90 70" aria-hidden="true"><path d="M12 13h66M12 35h66M12 57h66M12 13v44M34 13v44M56 13v44M78 13v44"/><path className="help-doodle__accent line-stroke" d="M14 34c18 2 45-2 62 1"/><path className="help-pin" d="m64 17 8 5-4 7-2 10-4-9-7-5Z"/></svg>;
}

function FirstBingoNote({ winner, prize }: { winner: string|null; prize: string }) {
  if (winner) return <div className="first-bingo first-bingo--finished"><Check/><span><b>Défi premier bingo terminé</b> · {winner} a déjà complété sa grille. <em>Le tirage final reste à venir.</em></span></div>;
  return <div className="first-bingo"><Trophy/><div><small>DÉFI EXPRESS</small><strong>Remplis toute la grille en premier</strong><span>À gagner : {prize}</span></div></div>;
}

function ChanceBoard({ entries, maxEntries }: { entries: number; maxEntries: number }) {
  const previous = useRef(entries); const [celebrating, setCelebrating] = useState<number|null>(null);
  useEffect(() => {
    if (entries > previous.current) { setCelebrating(entries - 1); const timer = setTimeout(() => setCelebrating(null), 1100); previous.current = entries; return () => clearTimeout(timer); }
    previous.current = entries;
  }, [entries]);
  return <aside className={`chance-board ${celebrating !== null ? 'chance-board--celebrating' : ''}`}>
    <div className="chance-board__copy"><p className="eyebrow">TES CHANCES AU TIRAGE</p><strong>{entries}<span>/{maxEntries}</span></strong><p>Chaque ligne ou colonne complète ajoute une participation au tirage.</p></div>
    <div className="chance-pins" role="progressbar" aria-label="Chances gagnées" aria-valuemin={0} aria-valuemax={maxEntries} aria-valuenow={entries}>
      {[...Array(maxEntries)].map((_, i) => <span key={i} className={`chance-pin ${i < entries ? 'is-filled' : ''} ${i === celebrating ? 'is-new' : ''}`}><svg viewBox="0 0 46 58" aria-hidden="true"><ellipse className="chance-pin__shadow" cx="23" cy="49" rx="14" ry="4"/><g className="chance-pin__body"><circle cx="23" cy="17" r="12"/><path d="M20 27h6l-1 17-2 6-2-6Z"/><path className="chance-pin__shine" d="M17 12c3-4 8-5 12-2"/></g></svg><small>+1</small></span>)}
    </div>
    {celebrating !== null && <div className="chance-confetti" aria-hidden="true">{[...Array(14)].map((_,i)=><i key={i} style={{'--i':i} as CSSProperties}/>)}</div>}
  </aside>;
}

const alphabet = 'abcdefghjkmnpqrstuvwxyz23456789';
async function makeCode(secretB64: string, eventId: string, time: number) {
  const bytes = Uint8Array.from(atob(secretB64), (char) => char.charCodeAt(0));
  const key = await crypto.subtle.importKey('raw', bytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const slot = Math.floor(time / 600_000);
  const signed = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${eventId}:${slot}`)));
  return [...signed.slice(0, 4)].map((byte) => alphabet[byte % alphabet.length]).join('');
}

function Brand({ compact = false }: { compact?: boolean }) {
  return <div className={`brand ${compact ? 'brand--compact' : ''}`} aria-label="AE2V Bingo"><img className="brand__logo" src="/assets/ae2v-logo.svg" alt="AE2V" /><span><b>BINGO</b><small>PAR AE2V</small></span></div>;
}

function PartyIllustration() {
  return <svg className="party-illustration" viewBox="0 0 420 260" role="img" aria-label="Des étudiants font connaissance pendant le bingo">
    <path className="doodle doodle--yellow" d="M34 62c34-40 85-50 128-18 30 22 45 63 25 98-23 39-82 43-122 21-42-23-64-63-31-101Z" />
    <path className="doodle doodle--blue" d="M252 41c55-27 120 9 130 70 8 51-33 105-88 102-53-3-90-54-72-102 7-18 13-53 30-70Z" />
    <circle cx="122" cy="88" r="31" fill="#fff9ee" stroke="#17151b" strokeWidth="5"/><path d="M91 171c4-45 19-67 31-67s27 22 31 67" fill="#ff5a4f" stroke="#17151b" strokeWidth="5"/><circle cx="113" cy="85" r="3.5"/><circle cx="133" cy="85" r="3.5"/><path d="M113 96c6 6 13 6 19 0" fill="none" stroke="#17151b" strokeWidth="4" strokeLinecap="round"/>
    <circle cx="293" cy="98" r="32" fill="#fff9ee" stroke="#17151b" strokeWidth="5"/><path d="M259 190c2-48 19-72 34-72s32 24 34 72" fill="#8fe3b0" stroke="#17151b" strokeWidth="5"/><path d="M266 75c13-20 46-23 58 0" fill="#17151b"/><circle cx="283" cy="97" r="3.5"/><circle cx="303" cy="97" r="3.5"/><path d="M283 108c6 6 13 6 19 0" fill="none" stroke="#17151b" strokeWidth="4" strokeLinecap="round"/>
    <path d="M158 124c36-26 65-27 99 3" fill="none" stroke="#17151b" strokeWidth="5" strokeLinecap="round" strokeDasharray="8 10"/><path d="m204 101 10 9 15-20" fill="none" stroke="#d60106" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round"/>
    <path d="m63 32 6 12 13 3-10 9 1 14-12-7-13 6 3-14-10-10 14-1Z" fill="#ffd84d" stroke="#17151b" strokeWidth="3"/><path d="m348 191 5 10 11 2-8 8 2 11-10-5-10 5 2-11-8-8 11-2Z" fill="#ffd84d" stroke="#17151b" strokeWidth="3"/>
  </svg>;
}

function Toast({ message, kind = 'info', onClose }: { message: string; kind?: 'info'|'error'|'success'; onClose: () => void }) {
  useEffect(() => { const timer = setTimeout(onClose, 4200); return () => clearTimeout(timer); }, [onClose]);
  return <div className={`toast toast--${kind}`} role="status">{kind === 'success' ? <Check/> : kind === 'error' ? <AlertTriangle/> : <CircleHelp/>}<span>{message}</span><button onClick={onClose} aria-label="Fermer"><X/></button></div>;
}

function Registration({ state, onDone }: { state: PublicState; onDone: () => void }) {
  const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(''); const data = new FormData(event.currentTarget);
    try { await api('/api/player/register', { method: 'POST', body: JSON.stringify({ firstName: data.get('firstName'), lastName: data.get('lastName') }) }); localStorage.setItem('bingo_registered', '1'); onDone(); }
    catch (err) { setError((err as Error).message); } finally { setBusy(false); }
  }
  return <main className="welcome-shell">
    <header><Brand/></header>
    <section className="welcome-copy"><p className="eyebrow">SOIRÉE D’INTÉGRATION · 17.09.2026</p><h1>Le bingo<br/><em>humain.</em></h1><p>Rencontre les autres étudiants, trouve qui correspond à chaque défi et scanne son code.</p><div className="welcome-promises"><span><Gift/><b>Grille complète</b><small>Un cadeau à gagner</small></span><span><Trophy/><b>Lignes et colonnes</b><small>Des participations au tirage</small></span></div><PartyIllustration/></section>
    <form className="join-card" onSubmit={submit}>
      <div className={`state-pill state-pill--${state.state.toLowerCase()}`}>{state.state === 'RUNNING' ? 'La partie est ouverte' : state.state === 'WAITING' ? 'Inscriptions ouvertes' : 'Partie terminée'}</div>
      <h2>Crée ta grille</h2><p>Deux infos, puis ta grille personnelle est prête.</p>
      <label>Prénom<input name="firstName" autoComplete="given-name" required minLength={2} placeholder="Camille" /></label>
      <label>Nom<input name="lastName" autoComplete="family-name" required minLength={2} placeholder="Martin" /></label>
      {error && <p className="form-error"><AlertTriangle/> {error}</p>}
      <button className="button button--primary" disabled={busy || state.state === 'ENDED'}>{busy ? <LoaderCircle className="spin"/> : <Sparkles/>}{busy ? 'Création…' : state.state === 'ENDED' ? 'Inscriptions terminées' : 'Créer ma grille'}</button>
      <p className="privacy"><ShieldCheck/> Aucun e-mail demandé.</p>
    </form>
  </main>;
}

function ValidationSheet({ item, onClose, onSuccess }: { item: GridItem; onClose: () => void; onSuccess: (pending?: boolean) => void }) {
  const [firstName, setFirstName] = useState(''); const [code, setCode] = useState(''); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const video = useRef<HTMLVideoElement>(null); const scanCanvas = useRef<HTMLCanvasElement>(null); const [camera, setCamera] = useState(false); const [cameraStatus, setCameraStatus] = useState<'idle'|'requesting'|'active'|'manual'>('idle'); const [cameraMessage, setCameraMessage] = useState(''); const stream = useRef<MediaStream|null>(null);
  const stopCamera = useCallback(() => { stream.current?.getTracks().forEach((track) => track.stop()); stream.current = null; setCamera(false); setCameraStatus('idle'); setCameraMessage(''); }, []);
  const validatePerson = useCallback(async (name: string, validationCode: string) => {
    setBusy(true); setError('');
    const payload = { itemId: item.id, firstName: name, code: validationCode.toLowerCase(), scannedAt: Date.now(), clientId: crypto.randomUUID() };
    try { await api('/api/player/validate', { method: 'POST', body: JSON.stringify(payload) }); onSuccess(); }
    catch (err) {
      if (err instanceof TypeError || !navigator.onLine) { await queuePending(payload); onSuccess(true); }
      else setError((err as Error).message);
    } finally { setBusy(false); }
  }, [item.id, onSuccess]);
  useEffect(() => stopCamera, [stopCamera]);
  async function startCamera() {
    setError(''); setCameraMessage('');
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) { setCameraStatus('manual'); setCameraMessage('La caméra mobile exige une page HTTPS. Ouvre le lien sécurisé bingo.ae2v.fr ou ngrok, puis réessaie.'); return; }
    setCameraStatus('requesting');
    try {
      try { stream.current = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } } }); }
      catch (firstError) { if ((firstError as DOMException).name === 'OverconstrainedError') stream.current = await navigator.mediaDevices.getUserMedia({ audio: false, video: true }); else throw firstError; }
      setCamera(true); setCameraStatus('active');
    } catch (cameraError) {
      const name = (cameraError as DOMException).name; setCameraStatus('manual');
      setCameraMessage(name === 'NotAllowedError' ? 'Autorisation refusée. Active la caméra pour ce site dans les réglages du navigateur, puis touche « Réessayer ».' : name === 'NotFoundError' ? 'Aucune caméra n’a été trouvée sur cet appareil.' : name === 'NotReadableError' ? 'La caméra est déjà utilisée par une autre application. Ferme-la puis réessaie.' : 'Impossible d’ouvrir la caméra. Utilise la saisie manuelle juste dessous.');
    }
  }
  useEffect(() => {
    if (!camera || !video.current || !stream.current) return;
    const element = video.current; element.srcObject = stream.current; void element.play();
    let cancelled = false; let frame = 0; let lastScan = 0;
    const Detector = (window as any).BarcodeDetector;
    let detector = null;
    try { detector = Detector ? new Detector({ formats: ['qr_code'] }) : null; }
    catch { detector = null; }
    const scan = async (time: number) => {
      if (cancelled || !stream.current) return;
      if (time - lastScan > 180 && element.readyState >= 2 && element.videoWidth > 0 && scanCanvas.current) {
        lastScan = time;
        const width = Math.min(720, element.videoWidth);
        const height = Math.round(width * element.videoHeight / element.videoWidth);
        const rawValue = await decodeQrFrame({ source: element, width, height, canvas: scanCanvas.current, detector });
        if (rawValue) {
          const [name, qrCode] = rawValue.split(';');
          if (name && qrCode) { setFirstName(name); setCode(qrCode); stopCamera(); await validatePerson(name, qrCode); return; }
        }
      }
      frame = requestAnimationFrame(scan);
    };
    frame = requestAnimationFrame(scan); return () => { cancelled = true; cancelAnimationFrame(frame); };
  }, [camera, stopCamera, validatePerson]);
  async function submit(event: FormEvent) {
    event.preventDefault(); await validatePerson(firstName, code);
  }
  return <div className="sheet-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}><section className="sheet" role="dialog" aria-modal="true" aria-labelledby="validate-title">
    <div className="sheet__handle"/><button className="icon-button sheet__close" onClick={onClose} aria-label="Fermer"><X/></button>
    <p className="eyebrow">CASE {item.position + 1} · {item.category}</p><h2 id="validate-title">{item.text}</h2>
    <button className="scan-button" type="button" disabled={cameraStatus === 'requesting' || busy} onClick={camera ? stopCamera : startCamera}><Camera/>{busy ? 'Validation automatique…' : camera ? 'Scan automatique en cours' : cameraStatus === 'requesting' ? 'Autorisation…' : cameraStatus === 'manual' ? 'Réessayer la caméra' : 'Scanner le QR automatiquement'}</button>
    {cameraMessage && <p className={`camera-message camera-message--${cameraStatus}`}><CircleHelp/>{cameraMessage}</p>}
    {camera && <div className="camera-frame"><video className="camera" ref={video} muted playsInline autoPlay/><canvas ref={scanCanvas} hidden/><span>Place le QR dans le cadre</span></div>}
    <div className="divider"><span>ou saisir son code</span></div>
    <form onSubmit={submit} className="validation-form"><label>Son prénom<input value={firstName} onChange={(e) => setFirstName(e.target.value)} autoCapitalize="none" placeholder="lucas" required/></label><label>Son code<input className="code-input" value={code} onChange={(e) => setCode(e.target.value.slice(0,4))} autoCapitalize="none" placeholder="k7m4" minLength={4} maxLength={4} required/></label>{error && <p className="form-error"><AlertTriangle/> {error}</p>}<button className="button button--primary" disabled={busy}>{busy ? <LoaderCircle className="spin"/> : <Check/>}Valider cette case</button></form>
  </section></div>;
}

function GridView({ data, refresh, notify }: { data: PlayerData; refresh: () => void; notify: (m: string, k?: 'info'|'error'|'success') => void }) {
  const [selected, setSelected] = useState<GridItem|null>(null); const [pending, setPending] = useState<Set<string>>(new Set());
  return <><section className="player-hero"><div><p className="eyebrow">TA GRILLE</p><h1>À toi de jouer, {data.user.firstName}.</h1></div><div className="progress-badge"><strong>{data.progress.validated}<span>/16</span></strong><small>cases</small></div></section>
    {data.state.state !== 'RUNNING' && <div className="notice"><CircleHelp/><span>{data.state.state === 'WAITING' ? 'La grille est prête. AE2V va bientôt lancer la partie.' : 'La partie est terminée. Les résultats arrivent ici.'}</span></div>}
    <FirstBingoNote winner={data.state.firstFullWinner} prize={data.state.prizes.full}/>
    <div className="grid-wrap"><div className="bingo-grid" aria-label="Grille de bingo"><svg className="bingo-grid__fills" viewBox="-4 -4 108 108" aria-hidden="true" preserveAspectRatio="none">
      {data.grid.map((item) => { const status = pending.has(item.id) ? 'pending' : item.status; return <path key={item.id} className={`bingo-fill bingo-fill--d${Math.min(3, Math.max(1, item.difficulty || 1))} bingo-fill--${status}`} d={gridFillPath(item.position)}/> })}
    </svg><svg className="bingo-grid__lines" viewBox="-4 -4 108 108" aria-hidden="true" preserveAspectRatio="none">
      <path d="M-.8 -2 C.9 18 -.5 42 .7 62 C1.7 79 -.4 94 .8 102" />
      <path d="M24.7 -2 C23.8 15 25.9 31 24.8 49 C23.7 67 25.4 83 24.3 102" />
      <path d="M50.2 -2 C49.2 15 50.9 33 50.1 51 C49.2 70 51.1 85 50 102" />
      <path d="M75.5 -2 C74.1 18 76.4 35 75.2 53 C74.1 69 76.1 84 75.4 102" />
      <path d="M100.5 -2 C99.2 19 100.9 39 99.8 59 C98.9 76 100.6 91 99.4 102" />
      <path d="M-2 .5 C16 -1 34 .8 50 -.2 C68 -1.2 84 1.2 102 .2" />
      <path d="M-2 24.5 C15 25.9 32 23.8 49 24.9 C67 26.1 84 23.7 102 24.6" />
      <path d="M-2 50.1 C18 48.9 32 51.2 50 50.3 C69 49.2 84 51.4 102 49.9" />
      <path d="M-2 75.3 C15 74 34 76.4 51 75.1 C68 73.9 84 76.2 102 75.5" />
      <path d="M-2 100.1 C17 101.3 33 98.6 51 100.5 C69 102.1 86 98.9 102 100.2" />
    </svg>{data.grid.map((item) => { const status = pending.has(item.id) ? 'pending' : item.status; const validator = item.validatorFirstName || 'AE2V'; return <button key={item.id} className={`bingo-cell bingo-cell--${status} bingo-cell--d${Math.min(3, Math.max(1, item.difficulty || 1))}`} disabled={status !== 'empty' || data.state.state !== 'RUNNING'} onClick={() => setSelected(item)} aria-label={`${item.text}, catégorie ${item.category}${status === 'confirmed' ? `, validée par ${validator}` : ''}`}><span className="bingo-cell__text">{item.text}</span><span className="bingo-cell__category" title={item.category} style={{ '--icon-rotation': `${((item.position * 7) % 13) - 6}deg` } as CSSProperties}><CategoryDoodle category={item.category}/></span>{status === 'confirmed' && <><span className="validator-name">{validator}</span><FingerprintStamp seed={item.position}/></>}{status === 'pending' && <span className="stamp stamp--pending"><LoaderCircle/> En attente</span>}</button>})}</div>
      <ChanceBoard entries={data.progress.entries} maxEntries={data.progress.maxEntries}/></div>
    {selected && <ValidationSheet item={selected} onClose={() => setSelected(null)} onSuccess={(isPending) => { setSelected(null); if (isPending) { setPending(new Set(pending).add(selected.id)); notify('Validation gardée sur ce téléphone. Elle partira dès que le réseau revient.'); } else { notify('Case validée !', 'success'); refresh(); } }}/>}</>;
}

function CodeView({ data }: { data: PlayerData }) {
  const [code, setCode] = useState('----'); const [seconds, setSeconds] = useState(600);
  useEffect(() => { let active = true; const update = async () => { const now = Date.now() + (data.state.serverTime - Date.now()); if (active) { setCode(await makeCode(data.user.codeSecret, data.user.eventId, now)); setSeconds(600 - Math.floor((now / 1000) % 600)); } }; update(); const timer = setInterval(update, 1000); return () => { active = false; clearInterval(timer); }; }, [data]);
  const payload = `${data.user.firstNormalized};${code}`;
  return <section className="code-view"><p className="eyebrow">TON PASS RENCONTRE</p><h1>Fais scanner ce code.</h1><div className="qr-ticket"><div className="qr-ticket__top"><span>SOIRÉE D’INTÉGRATION · AE2V</span><b>PASS RENCONTRE</b><QRCodeSVG value={payload} size={220} bgColor="#f6e8bd" fgColor="#291a3f" level="M"/><small>Présente ce QR à la personne rencontrée</small></div><div className="qr-ticket__tear"><span className="ticket-notch ticket-notch--left"/><i/><span className="ticket-notch ticket-notch--right"/></div><div className="qr-ticket__stub"><small>ADMIT ONE · 17 SEPT. 2026</small><strong>{data.user.firstName}</strong><code>{code}</code><span>Nouveau code dans {Math.floor(seconds/60)}:{String(seconds%60).padStart(2,'0')}</span></div></div></section>;
}

function RulesView({ data }: { data: PlayerData }) { return <section className="rules-view"><p className="eyebrow">BESOIN D’UN COUP DE MAIN ?</p><h1>Comment jouer</h1><p className="rules-intro">Tout se fait en trois gestes. Pas besoin de compte ni d’application à installer.</p><ol className="steps"><li><HelpDoodle kind="meet"/><span className="step-number">1</span><div><b>Trouve la bonne personne</b><p>Choisis un défi dans ta grille et rencontre quelqu’un qui lui correspond.</p></div></li><li><HelpDoodle kind="scan"/><span className="step-number">2</span><div><b>Demande son code</b><p>Touche la case, autorise la caméra et cadre son QR : la validation se fait automatiquement. La saisie manuelle reste disponible en secours.</p></div></li><li><HelpDoodle kind="line"/><span className="step-number">3</span><div><b>Aligne quatre cases</b><p>Chaque ligne ou colonne complète ajoute une participation au tirage, jusqu’à {data.progress.maxEntries}.</p></div></li></ol><div className="prize-card"><Gift/><div><small>PREMIER BINGO COMPLET</small><strong>{data.state.prizes.full}</strong></div></div><div className="prize-card prize-card--raffle"><Trophy/><div><small>TIRAGE FINAL</small><strong>{data.state.prizes.raffle}</strong></div></div></section>; }

function Results({ data }: { data: PlayerData }) { const waiting = !data.state.raffleWinners.length; return <section className="results"><Sparkles className="results__spark"/><p className="eyebrow">{waiting ? 'PARTIE TERMINÉE' : 'RÉSULTATS'}</p><h1>{waiting ? 'En attente du tirage' : 'Les gagnant·es'}</h1>{data.state.firstFullWinner ? <div className="winner winner--gold"><Trophy/><span>Premier bingo complet</span><strong>{data.state.firstFullWinner}</strong><small>{data.state.prizes.full}</small></div> : <p>Le premier bingo complet n’a pas été remporté.</p>}<div className="winner-list">{data.state.raffleWinners.map((winner)=><div className="winner" key={winner.position}><span>#{winner.position}</span><strong>{winner.firstName}</strong><small>{winner.prize}</small></div>)}</div>{waiting && <div className="empty draw-wait"><LoaderCircle className="spin"/><p>AE2V prépare le tirage. Cette page se met à jour automatiquement.</p></div>}</section>; }

function PlayerApp({ initial, onAccountGone }: { initial: PlayerData; onAccountGone: () => void }) {
  const [data, setData] = useState(initial); const [tab, setTab] = useState<'grid'|'code'|'rules'|'results'>('grid'); const [toast, setToast] = useState<{m:string;k:'info'|'error'|'success'}|null>(null);
  const refresh = useCallback(async () => { try { setData(await api('/api/player/me')); } catch (error) { if (error instanceof ApiError && error.status === 401) onAccountGone(); } }, [onAccountGone]);
  const notify = useCallback((m: string, k: 'info'|'error'|'success' = 'info') => setToast({m,k}), []);
  useEffect(() => { const sync=()=>{if(document.visibilityState==='visible')void refresh()};const timer=setInterval(sync,3_000);window.addEventListener('focus',sync);document.addEventListener('visibilitychange',sync);return()=>{clearInterval(timer);window.removeEventListener('focus',sync);document.removeEventListener('visibilitychange',sync)}}, [refresh]);
  useEffect(() => { const sync = async () => { for (const pending of await listPending()) { try { await api('/api/player/validate', { method: 'POST', body: JSON.stringify(pending) }); await removePending(pending.clientId); notify('Une validation en attente vient d’être confirmée.', 'success'); await refresh(); } catch (error) { if (error instanceof ApiError && error.status < 500) { await removePending(pending.clientId); notify(error.message, 'error'); } } } }; window.addEventListener('online', sync); sync(); return () => window.removeEventListener('online', sync); }, [notify, refresh]);
  useEffect(() => { if (data.state.state === 'ENDED') setTab('results'); }, [data.state.state]);
  return <div className="app-shell"><header className="app-header"><Brand compact/><div className={`live-state live-state--${data.state.state.toLowerCase()}`}><i/>{data.state.state === 'RUNNING' ? 'En cours' : data.state.state === 'WAITING' ? 'En attente' : data.state.raffleWinners.length ? 'Résultats' : 'Tirage bientôt'}</div><span className="app-header__paper-edge" aria-hidden="true"/></header><main className="player-main">{tab === 'grid' && <GridView data={data} refresh={refresh} notify={notify}/>} {tab === 'code' && <CodeView data={data}/>} {tab === 'rules' && <RulesView data={data}/>} {tab === 'results' && <Results data={data}/>}</main><nav className="bottom-nav" aria-label="Navigation principale"><button className={tab==='grid'?'active':''} onClick={()=>setTab('grid')}><Grid3X3/><span>Ma grille</span></button><button className={tab==='code'?'active':''} onClick={()=>setTab('code')}><QrCode/><span>Mon code</span></button><button className={tab==='rules'?'active':''} onClick={()=>setTab('rules')}><CircleHelp/><span>Aide</span></button>{data.state.state==='ENDED'&&<button className={tab==='results'?'active':''} onClick={()=>setTab('results')}><Trophy/><span>{data.state.raffleWinners.length?'Résultats':'Tirage'}</span></button>}</nav>{toast && <Toast message={toast.m} kind={toast.k} onClose={()=>setToast(null)}/>}</div>;
}

function TerminalPage({ kind, state, onReturn }: { kind: 'deleted'|'ended'; state: PublicState; onReturn: () => void }) {
  const ended = kind === 'ended';
  return <main className="terminal-page"><Brand/><section><span className="terminal-page__icon">{ended ? <Trophy/> : <Trash2/>}</span><p className="eyebrow">{ended ? 'BINGO TERMINÉ' : 'SESSION FERMÉE'}</p><h1>{ended ? (state.raffleWinners.length ? 'Le tirage est terminé.' : 'En attente du tirage.') : 'Compte supprimé.'}</h1><p>{ended ? (state.raffleWinners.length ? 'Les gagnants ont été annoncés par AE2V.' : 'AE2V prépare les résultats du tirage final.') : 'Cette grille n’est plus active. Tu peux revenir à l’accueil.'}</p>{state.raffleWinners.length>0&&<div className="terminal-winners">{state.raffleWinners.map(w=><strong key={w.position}>#{w.position} · {w.firstName}</strong>)}</div>}<button className="button button--primary" onClick={onReturn}><ArrowLeft/>Retour au menu</button></section></main>;
}

function PublicApp() {
  const [state, setState] = useState<PublicState|null>(null); const [player, setPlayer] = useState<PlayerData|null>(null); const [loading, setLoading] = useState(true); const [accountGone,setAccountGone]=useState(false);
  const load = useCallback(async () => { setLoading(true); try { const publicData = await api<PublicState>('/api/public/state'); setState(publicData); try { setPlayer(await api<PlayerData>('/api/player/me')); } catch (error) { if (!(error instanceof ApiError) || error.status !== 401) throw error; if(localStorage.getItem('bingo_registered')==='1')setAccountGone(true); } } finally { setLoading(false); } }, []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { const refresh=async()=>{if(document.visibilityState!=='visible')return;try{setState(await api<PublicState>('/api/public/state'))}catch{}};const timer=setInterval(refresh,4_000);window.addEventListener('focus',refresh);document.addEventListener('visibilitychange',refresh);return()=>{clearInterval(timer);window.removeEventListener('focus',refresh);document.removeEventListener('visibilitychange',refresh)}},[]);
  if (loading || !state) return <div className="splash"><Brand/><LoaderCircle className="spin"/></div>;
  const returnToMenu=()=>{localStorage.removeItem('bingo_registered');setAccountGone(false);setPlayer(null)};
  if(accountGone)return <TerminalPage kind="deleted" state={state} onReturn={returnToMenu}/>;
  if(!player&&state.state==='ENDED')return <TerminalPage kind="ended" state={state} onReturn={returnToMenu}/>;
  return player ? <PlayerApp initial={player} onAccountGone={()=>{setPlayer(null);setAccountGone(true)}}/> : <Registration state={state} onDone={load}/>;
}

type AdminState = { event: any; stats: { players: number; validations: number }; suspicion: any[]; firstFullWinner: any; drawWinners: any[] };
type AdminUserSummary = { id: string; first_name: string; last_name: string; validations: number; scans_made: number; scans_received: number; created_at: string };
type AdminUserDetail = {
  user: AdminUserSummary & { attempts: number; rejected: number; recent: number; score: number; category_count: number };
  progress: { validated: number; entries: number; maxEntries: number };
  grid: Array<{ id: string; position: number; text: string; category: string; difficulty: number; validated_at: string|null; admin_validated: boolean; validator_first_name?: string; validator_last_name?: string }>;
  scans: Array<{ item_id: string; category: string; case_text: string; owner_first_name: string; owner_last_name: string; validated_at: string }>;
  peopleScanned: Array<{ item_id: string; category: string; case_text: string; person_first_name: string; person_last_name: string; validated_at: string }>;
  categories: Array<{ category: string; validations: number }>;
};

function AdminUserPanel({ detail, onClose, onRefresh, onDeleted }: { detail: AdminUserDetail; onClose: () => void; onRefresh: () => Promise<void>; onDeleted: () => Promise<void> }) {
  const [busy, setBusy] = useState<string|null>(null); const [error, setError] = useState(''); const [scanView,setScanView]=useState<'made'|'received'>('made');
  const name = `${detail.user.first_name} ${detail.user.last_name}`;
  async function toggleItem(item: AdminUserDetail['grid'][number]) {
    const validated = !item.validated_at;
    if (!validated && !confirm(`Annuler la validation de la case « ${item.text} » ?`)) return;
    setBusy(item.id); setError('');
    try { await api(`/api/admin/users/${detail.user.id}/grid/${item.id}`, { method: 'PATCH', body: JSON.stringify({ validated }) }); await onRefresh(); }
    catch (err) { setError((err as Error).message); } finally { setBusy(null); }
  }
  async function cancelScans(category?: string) {
    const label = category ? `toutes les validations de ${name} dans la catégorie « ${category} »` : `toutes les validations faites avec le QR de ${name}`;
    if (!confirm(`Annuler ${label} chez tous les participants concernés ?`)) return;
    setBusy(category ?? 'all-scans'); setError('');
    try { await api(`/api/admin/users/${detail.user.id}/cancel-validations`, { method: 'POST', body: JSON.stringify({ category }) }); await onRefresh(); }
    catch (err) { setError((err as Error).message); } finally { setBusy(null); }
  }
  async function removeUser() {
    if (!confirm(`Supprimer définitivement ${name}, sa grille et ses validations chez les autres participants ?`)) return;
    setBusy('delete'); setError('');
    try { await api(`/api/admin/users/${detail.user.id}`, { method: 'DELETE' }); await onDeleted(); }
    catch (err) { setError((err as Error).message); setBusy(null); }
  }
  return <div className="admin-user-backdrop" onMouseDown={(event)=>event.target===event.currentTarget&&onClose()}><aside className="admin-user-panel" aria-label={`Compte de ${name}`}>
    <header><div><p className="eyebrow">FICHE PARTICIPANT</p><h2>{name}</h2></div><button className="icon-button" onClick={onClose} aria-label="Fermer"><X/></button></header>
    <div className="admin-user-summary"><div className="risk-score risk-score--large" style={{'--risk':`${detail.user.score}%`} as CSSProperties}><strong>{detail.user.score}%</strong></div><div><b>Score de vigilance</b><span>{detail.user.rejected} refus · {detail.user.scans_received} scans subis · {detail.user.category_count} catégories chez les autres</span></div><div className="admin-profile-kpis"><span><strong>{detail.progress.validated}</strong><small>cases validées</small></span><span><strong>{detail.peopleScanned.length}</strong><small>scans effectués</small></span><span><strong>{detail.scans.length}</strong><small>scans subis</small></span><span className="admin-profile-kpis__draw"><strong>{detail.progress.entries}/{detail.progress.maxEntries}</strong><small>participations débloquées</small></span></div></div>
    {error&&<p className="form-error"><AlertTriangle/>{error}</p>}
    <section className="admin-user-section"><div className="admin-user-section__title"><div><p className="eyebrow">GRILLE SIMPLIFIÉE</p><h3>Cliquer pour valider ou annuler</h3></div><Grid3X3/></div><div className="admin-mini-grid">{detail.grid.map(item=><button key={item.id} className={item.validated_at?'is-validated':''} disabled={busy===item.id} onClick={()=>toggleItem(item)} title={item.text}><span>{item.position+1}</span><b>{item.text}</b><small>{item.validated_at?(item.admin_validated?'Validée par admin':`${item.validator_first_name ?? ''} ${item.validator_last_name ?? ''}`.trim()):'À faire'}</small></button>)}</div></section>
    <section className="admin-user-section"><div className="admin-user-section__title"><div><p className="eyebrow">HISTORIQUE DES RENCONTRES</p><h3>Qui a scanné qui ?</h3></div><Users/></div><div className="admin-scan-tabs" role="tablist" aria-label="Sens des scans"><button role="tab" aria-selected={scanView==='made'} className={scanView==='made'?'active':''} onClick={()=>setScanView('made')}>Scans effectués <b>{detail.peopleScanned.length}</b></button><button role="tab" aria-selected={scanView==='received'} className={scanView==='received'?'active':''} onClick={()=>setScanView('received')}>Scans subis <b>{detail.scans.length}</b></button></div><div className="admin-scan-people">{scanView==='made'?(detail.peopleScanned.length?detail.peopleScanned.map(row=><article key={row.item_id}><UserRound/><div><strong>{row.person_first_name} {row.person_last_name}</strong><span>{row.category} · {row.case_text}</span></div></article>):<p className="admin-empty">Cette personne n’a encore scanné personne.</p>):(detail.scans.length?detail.scans.map(row=><article key={row.item_id}><QrCode/><div><strong>{row.owner_first_name} {row.owner_last_name}</strong><span>{row.category} · {row.case_text}</span></div></article>):<p className="admin-empty">Personne n’a encore scanné son code.</p>)}</div></section>
    <section className="admin-user-section"><div className="admin-user-section__title"><div><p className="eyebrow">CATÉGORIES SCANNÉES</p><h3>Utilisation de son QR chez les autres</h3></div><QrCode/></div>{detail.categories.length?<div className="admin-category-list">{detail.categories.map(row=><article key={row.category}><div><strong>{row.category}</strong><span>{row.validations} validation{row.validations>1?'s':''}</span></div><button disabled={busy===row.category} onClick={()=>cancelScans(row.category)}><Undo2/>Annuler cette catégorie</button></article>)}</div>:<p className="admin-empty">Personne n’a encore validé de case avec son QR.</p>}{detail.scans.length>0&&<button className="admin-cancel-all" disabled={busy==='all-scans'} onClick={()=>cancelScans()}><Undo2/>Annuler toutes ses validations chez les autres</button>}</section>
    <section className="admin-user-section admin-user-actions"><button onClick={async()=>{if(confirm(`Réinitialiser l’accès de ${name} ?`)){setBusy('device');await api(`/api/admin/users/${detail.user.id}/reset-device`,{method:'POST'});setBusy(null);}}}><UserRound/>Réinitialiser l’appareil</button><button className="danger" disabled={busy==='delete'} onClick={removeUser}><Trash2/>Supprimer le participant</button></section>
  </aside></div>;
}

function AdminApp() {
  const [auth, setAuth] = useState<boolean|null>(null); const [state, setState] = useState<AdminState|null>(null); const [query,setQuery]=useState(''); const [users,setUsers]=useState<AdminUserSummary[]>([]); const [selected,setSelected]=useState<AdminUserDetail|null>(null); const [error,setError]=useState(''); const [finishOpen,setFinishOpen]=useState(false); const [actionBusy,setActionBusy]=useState(false);
  const loadUsers = useCallback(async (term='') => setUsers(await api(`/api/admin/users?q=${encodeURIComponent(term)}`)), []);
  const load = useCallback(async () => { try { const next=await api<AdminState>('/api/admin/state');setState(next);setAuth(true);await loadUsers(); } catch (e) { if (e instanceof ApiError && e.status === 401) setAuth(false); else setError((e as Error).message); } }, [loadUsers]);
  const openUser = useCallback(async (id:string)=>setSelected(await api<AdminUserDetail>(`/api/admin/users/${id}`)),[]);
  useEffect(()=>{load();},[load]);
  useEffect(()=>{if(!auth)return;const refresh=()=>{if(document.visibilityState==='visible')void load()};const timer=setInterval(refresh,4000);window.addEventListener('focus',refresh);document.addEventListener('visibilitychange',refresh);return()=>{clearInterval(timer);window.removeEventListener('focus',refresh);document.removeEventListener('visibilitychange',refresh)}},[auth,load]);
  async function login(e:FormEvent<HTMLFormElement>){e.preventDefault();const d=new FormData(e.currentTarget);try{await api('/api/admin/login',{method:'POST',body:JSON.stringify({password:d.get('password')})});await load();}catch(err){setError((err as Error).message)}}
  async function action(name:'start'|'finish'|'reset'){let confirmation; if(name==='reset'){confirmation=prompt('Cette action efface tous les joueurs, grilles et résultats. Écris RESET BINGO pour confirmer.');if(confirmation!=='RESET BINGO')return;} setActionBusy(true);setError('');try{await api(`/api/admin/game/${name}`,{method:'POST',body:JSON.stringify({confirmation})});setFinishOpen(false);await load();}catch(err){setError((err as Error).message)}finally{setActionBusy(false)}}
  async function search(e:FormEvent){e.preventDefault();await loadUsers(query);}
  async function deleteUser(user:AdminUserSummary){if(!confirm(`Supprimer définitivement ${user.first_name} ${user.last_name} ?`))return;setError('');try{await api(`/api/admin/users/${user.id}`,{method:'DELETE'});await load();}catch(err){setError((err as Error).message)}}
  async function refreshSelected(){if(!selected)return;await Promise.all([openUser(selected.user.id),loadUsers(query),load()]);}
  async function afterDelete(){setSelected(null);await Promise.all([loadUsers(query),load()]);}
  if(auth===null)return <div className="splash"><LoaderCircle className="spin"/></div>;
  if(!auth)return <main className="admin-login"><section className="admin-login__intro"><Brand/><div><p className="eyebrow">SOIRÉE D’INTÉGRATION · AE2V</p><h1>Pilote le bingo.</h1><p>Démarre la partie, suis les participants et lance le tirage depuis un seul écran.</p></div></section><form onSubmit={login}><div className="admin-login__heading"><ShieldCheck/><div><p className="eyebrow">ACCÈS ORGANISATION</p><h2>Connexion rapide</h2></div></div><label>Mot de passe<input name="password" type="password" autoComplete="current-password" autoFocus required placeholder="Mot de passe admin"/></label>{error&&<p className="form-error"><AlertTriangle/>{error}</p>}<button className="button button--primary"><ShieldCheck/>Ouvrir le pilotage</button><a href="/"><ArrowLeft/>Retour au bingo</a></form></main>;
  if(!state)return null; const e=state.event;
  return <div className="admin-shell"><header><Brand compact/><div><span className={`state-pill state-pill--${e.state.toLowerCase()}`}>{e.state==='RUNNING'?'EN COURS':e.state==='ENDED'?'TERMINÉ':'EN ATTENTE'}</span><button className="icon-button" onClick={async()=>{await api('/api/admin/logout',{method:'POST'});setAuth(false)}} aria-label="Déconnexion"><LogOut/></button></div></header><main><div className="admin-title"><div><p className="eyebrow">17 SEPTEMBRE 2026</p><h1>Pilotage du bingo</h1></div><div className="admin-actions"><button onClick={()=>action('start')} disabled={e.state==='RUNNING'||actionBusy}><Sparkles/>{e.state==='ENDED'?'Redémarrer':'Démarrer'}</button><button onClick={()=>setFinishOpen(true)} disabled={e.state!=='RUNNING'||actionBusy}><Trophy/>Terminer</button><button className="danger" disabled={actionBusy} onClick={()=>action('reset')}><AlertTriangle/>Reset</button></div></div>{error&&<p className="form-error admin-global-error"><AlertTriangle/>{error}</p>}<section className="admin-stats"><div><Users/><strong>{state.stats.players}</strong><span>participants</span></div><div><Check/><strong>{state.stats.validations}</strong><span>validations</span></div><div><Trophy/><strong>{state.firstFullWinner?`${state.firstFullWinner.first_name} ${state.firstFullWinner.last_name}`:'—'}</strong><span>premier bingo</span></div></section>
  <div className="admin-grid"><section className="admin-panel admin-search"><div className="panel-heading"><div><p className="eyebrow">PARTICIPANTS · {users.length}</p><h2>Tous les comptes</h2></div><Search/></div><form onSubmit={search}><input value={query} onChange={ev=>setQuery(ev.target.value)} placeholder="Prénom ou nom"/><button>Rechercher</button></form><div className="user-results">{users.map(u=><article key={u.id}><button className="user-result-main" onClick={()=>openUser(u.id)}><UserRound/><span><strong>{u.first_name} {u.last_name}</strong><small>{u.validations} cases · {u.scans_made} scans faits · {u.scans_received} subis</small></span></button><button className="user-delete" aria-label={`Supprimer ${u.first_name} ${u.last_name}`} onClick={()=>deleteUser(u)}><Trash2/></button></article>)}{!users.length&&<p className="admin-empty">Aucun participant trouvé.</p>}</div></section><section className="admin-panel"><div className="panel-heading"><div><p className="eyebrow">TOP À VÉRIFIER</p><h2>Comptes inhabituels</h2></div><AlertTriangle/></div><div className="risk-list">{state.suspicion.map(u=><button className="risk-row" key={u.id} onClick={()=>openUser(u.id)}><div className="risk-score" style={{'--risk':`${u.score}%`} as CSSProperties}><strong>{u.score}%</strong></div><span><b>{u.first_name} {u.last_name}</b><small>{u.rejected} refus · {u.scans_received} scans subis · {u.category_count} catégories</small></span></button>)}{!state.suspicion.length&&<p>Aucun signal pour le moment.</p>}</div></section>
  <Config state={state} reload={load}/><section className="admin-panel draw-panel"><div className="panel-heading"><div><p className="eyebrow">TIRAGE FINAL</p><h2>{e.raffle_winner_count} gagnant·es</h2></div><Gift/></div><p>Lot : <strong>{e.raffle_prize_label}</strong></p><button className="button button--primary" disabled={e.state==='WAITING'} onClick={async()=>{const message=e.state==='RUNNING'?`Terminer la partie et tirer ${e.raffle_winner_count} gagnant·es maintenant ?`:`Relancer le tirage de ${e.raffle_winner_count} gagnant·es ?`;if(confirm(message)){await api('/api/admin/draw',{method:'POST'});load();}}}><Sparkles/>{e.state==='RUNNING'?'Terminer et tirer':'Lancer le tirage'}</button><div className="draw-list">{state.drawWinners.map(w=><div key={w.id}><span>#{w.position}</span><strong>{w.first_name} {w.last_name}</strong><small>{w.entries} chance{w.entries>1?'s':''}</small></div>)}</div></section></div></main>{selected&&<AdminUserPanel detail={selected} onClose={()=>setSelected(null)} onRefresh={refreshSelected} onDeleted={afterDelete}/>} {finishOpen&&<ConfirmFinishModal busy={actionBusy} onCancel={()=>setFinishOpen(false)} onConfirm={()=>action('finish')}/>}</div>;
}

function Config({state,reload}:{state:AdminState;reload:()=>void}){const e=state.event;async function save(ev:FormEvent<HTMLFormElement>){ev.preventDefault();const d=new FormData(ev.currentTarget);await api('/api/admin/config',{method:'PATCH',body:JSON.stringify({raffleWinnerCount:Number(d.get('count')),rafflePrizeLabel:d.get('raffle'),firstFullPrizeLabel:d.get('full'),maxRaffleEntries:Number(d.get('max')),excludeFirstFromRaffle:d.get('exclude')==='on'})});await reload();}return <section className="admin-panel"><div className="panel-heading"><div><p className="eyebrow">CONFIGURATION</p><h2>Lots et tirage</h2></div><Settings2/></div><form className="config-form" onSubmit={save}><label>Nombre de gagnant·es<input name="count" type="number" min="1" max="50" defaultValue={e.raffle_winner_count}/></label><label>Lot du tirage<input name="raffle" defaultValue={e.raffle_prize_label}/></label><label>Lot du premier bingo<input name="full" defaultValue={e.first_full_prize_label}/></label><label>Chances maximum<input name="max" type="number" min="1" max="8" defaultValue={e.max_raffle_entries}/></label><label className="checkbox"><input name="exclude" type="checkbox" defaultChecked={e.exclude_first_from_raffle}/><span>Exclure le premier bingo du tirage</span></label><button>Enregistrer</button></form></section>}

export function App(){return location.pathname.startsWith('/admin')?<AdminApp/>:<PublicApp/>}
