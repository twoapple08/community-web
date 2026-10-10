// 앱 알림을 눌렀을 때 "다른 화면이 열어야 하는 창"을 요청하는 작은 우편함
// - 신고 알림 → 피드(CommunityFeed / ClanFeed)가 가진 [신고 기록] 창을 열어야 함
// - 피드가 아직 화면에 없으면(글쓰기 화면 등) 요청을 보관해 두었다가, 피드가 뜰 때 꺼내 감

type Listener = () => void

let pendingReportsOpen = false
const reportsListeners = new Set<Listener>()

/** [신고 기록] 창 열기 요청. 듣고 있는 피드가 있으면 바로 열고, 없으면 보관 */
export const requestReportsOpen = () => {
  if (reportsListeners.size > 0) {
    pendingReportsOpen = false
    reportsListeners.forEach((listener) => listener())
    return
  }
  pendingReportsOpen = true
}

/** 보관된 요청이 있으면 꺼내고 true (피드가 처음 뜰 때 호출) */
export const consumeReportsOpenRequest = (): boolean => {
  if (!pendingReportsOpen) return false
  pendingReportsOpen = false
  return true
}

/** 피드가 화면에 있는 동안 요청을 받음. 반환값으로 해제 */
export const onReportsOpenRequest = (listener: Listener) => {
  reportsListeners.add(listener)
  return () => {
    reportsListeners.delete(listener)
  }
}
