export function ErrorBox({ error }: { error: any }) {
  if (!error) return null
  const msg = typeof error === 'string' ? error : (error.message ?? 'Ошибка')
  return (
    <div style={{ padding: 12, background: '#fff3f3', border: '1px solid #ffcccc', borderRadius: 8, marginBottom: 12 }}>
      <b>Ошибка:</b> {msg}
    </div>
  )
}
