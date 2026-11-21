import React, { useEffect, useState } from 'react'
import QRCode from 'qrcode'
import { Card } from './ui'
import { cloudEnabled, connectWithLink, disconnectSync, enableSync, syncLink, syncNow, useCloud } from '../lib/cloud'
import { cls } from '../lib/format'

export default function SyncCard() {
  const c = useCloud()
  const [qr, setQr] = useState('')
  const [paste, setPaste] = useState('')
  const [note, setNote] = useState('')
  const link = syncLink()
  useEffect(() => { link ? QRCode.toDataURL(link, { margin: 1, width: 360 }).then(setQr) : setQr('') }, [link])
  if (!cloudEnabled) return null
  const status = c.status === 'syncing' ? 'Syncing…' : c.status === 'error' ? 'Sync problem' : c.lastSync ? `Synced ${new Date(c.lastSync).toLocaleTimeString()}` : 'On'
  const copy = async () => { await navigator.clipboard.writeText(link); setNote('Link copied'); setTimeout(() => setNote(''), 2500) }
  const connect = () => { if (connectWithLink(paste)) setPaste(''); else setNote('That does not look like a sync link') }
  return (
    <Card title={<span className="row">Sync between devices<span className={cls('chip', c.key && (c.status === 'error' ? 'neg' : 'pos'))}>{c.key ? status : 'Off'}</span></span>}
      right={c.key && <span className="row"><button className="btn ghost sm" onClick={syncNow}>Sync now</button>
        <button className="btn ghost sm" onClick={() => confirm('Stop syncing on this device? The journal stays here and on your other devices.') && disconnectSync()}>Turn off here</button></span>}>
      {c.key ? (
        <div className="row wrap" style={{ gap: 22, alignItems: 'flex-start' }}>
          {qr && <img src={qr} alt="Sync QR code" width={150} height={150} style={{ borderRadius: 10, border: '1px solid var(--line)' }} />}
          <div className="col grow" style={{ minWidth: 240, gap: 10 }}>
            <div><b>Open the journal on your phone:</b> scan the code with the phone's camera, or send yourself the link. You only do this once per device.</div>
            <div className="row wrap">
              <button className="btn primary" onClick={copy}>Copy sync link</button>
              {note && <span className="chip pos">{note}</span>}
            </div>
            <div className="faint" style={{ fontSize: 12.5 }}>Keep this link private — anyone who has it can open and edit your journal. No email or password is involved.</div>
            {c.error && <div className="banner err">{c.error}</div>}
          </div>
        </div>
      ) : (
        <div className="col" style={{ gap: 12 }}>
          <div className="muted">Right now your journal lives only in this browser. Turn sync on to see the same journal on your phone and computer — no account needed.</div>
          <div className="row wrap">
            <button className="btn primary" onClick={enableSync}>Turn on sync</button>
            <span className="muted">or connect to a journal you already sync:</span>
            <input className="input" style={{ width: 260 }} placeholder="Paste a sync link" value={paste} onChange={(e) => setPaste(e.target.value)} />
            <button className="btn" disabled={!paste.trim()} onClick={connect}>Connect</button>
            {note && <span className="chip neg">{note}</span>}
          </div>
        </div>
      )}
    </Card>
  )
}
