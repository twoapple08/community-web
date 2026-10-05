import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'

// 개인정보처리방침 (로그인 없이 누구나 열람 가능한 정적 페이지)
export const metadata: Metadata = {
  title: '개인정보처리방침 | 스틱파이터 커뮤니티',
}

const EFFECTIVE_DATE = '2026년 10월 6일'
// 연락처 이메일은 사이트 제작자가 공개를 승인한 주소
const CONTACT_EMAIL = 'iwsamuel08@gmail.com'

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="text-base font-bold text-zinc-900 dark:text-white">{title}</h2>
      {children}
    </section>
  )
}

function NumberedList({ items }: { items: ReactNode[] }) {
  return (
    <ol className="list-decimal pl-5 space-y-1">
      {items.map((item, i) => (
        <li key={i}>{item}</li>
      ))}
    </ol>
  )
}

const Label = ({ children }: { children: ReactNode }) => (
  <strong className="font-bold text-zinc-900 dark:text-white">{children}</strong>
)

const ExternalLink = ({ href, children }: { href: string; children: ReactNode }) => (
  <a
    href={href}
    target="_blank"
    rel="noopener noreferrer"
    className="font-semibold text-zinc-900 dark:text-white underline underline-offset-2 hover:opacity-70 transition"
  >
    {children}
  </a>
)

// 위탁·국외 이전 수탁자
const PROCESSORS = [
  { name: 'Supabase Inc.', country: '미국', task: '데이터베이스·파일 저장, 로그인 인증 처리' },
  { name: 'Vercel Inc.', country: '미국', task: '웹사이트 호스팅, 접속 기록 처리' },
  { name: 'Google LLC', country: '미국', task: 'Google 계정 로그인(OAuth) 인증' },
]

const REMEDY_AGENCIES = [
  { name: '개인정보침해신고센터', site: 'privacy.kisa.or.kr', phone: '국번없이 118' },
  { name: '개인정보분쟁조정위원회', site: 'www.kopico.go.kr', phone: '1833-6972' },
  { name: '대검찰청', site: 'www.spo.go.kr', phone: '국번없이 1301' },
  { name: '경찰청', site: 'ecrm.police.go.kr', phone: '국번없이 182' },
]

export default function PrivacyPolicyPage() {
  return (
    <div className="w-full max-w-3xl mx-auto px-4 py-8">
      <Link
        href="/community"
        className="inline-flex items-center gap-1.5 text-sm text-zinc-400 hover:text-zinc-700 dark:hover:text-white transition"
      >
        <ArrowLeft className="w-4 h-4 shrink-0" />
        <span>피드로 돌아가기</span>
      </Link>

      <article className="mt-4 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-5 sm:p-8 shadow-sm">
        <h1 className="text-xl font-black text-zinc-900 dark:text-white">개인정보처리방침</h1>
        <p className="mt-1.5 text-xs text-zinc-500 dark:text-zinc-400">시행일: {EFFECTIVE_DATE}</p>

        <div className="mt-6 space-y-7 text-sm leading-relaxed text-zinc-700 dark:text-zinc-300">
          <Section title="제1조 (총칙)">
            <p>
              스틱파이터 커뮤니티(SFAClan, https://www.sfaclan.com, 이하 &quot;사이트&quot;)는 「개인정보 보호법」 등 관련 법령을
              준수하며, 이용자의 개인정보를 보호하고 이와 관련한 고충을 신속하고 원활하게 처리할 수 있도록 다음과 같이
              개인정보처리방침을 수립·공개합니다.
            </p>
          </Section>

          <Section title="제2조 (수집하는 개인정보 항목)">
            <p>사이트는 서비스 제공을 위해 다음의 개인정보를 처리합니다.</p>
            <NumberedList
              items={[
                <>
                  <Label>[필수]</Label> Google 계정 로그인 시 이메일 주소, 계정 고유 식별자(로그인 과정에서 Google이 이름·프로필
                  사진 정보를 함께 전달할 수 있습니다), 닉네임
                </>,
                <>
                  <Label>[선택]</Label> 프로필 사진, 한 줄 소개
                </>,
                <>
                  <Label>[서비스 이용 중 생성]</Label> 게시글·댓글 및 첨부 이미지·동영상, 좋아요·신고 기록, 건의사항·이의제기
                  내용(작성자 이메일 포함), 알림 기록
                </>,
                <>
                  <Label>[자동 수집]</Label> 접속 일시, IP 주소, 브라우저 정보(호스팅·데이터베이스 서비스의 보안 로그)
                </>,
                <>
                  <Label>[기기 저장]</Label> 로그인 유지 정보와 화면 설정(테마, 보기 방식, 즐겨찾기 색 등)은 이용자의 브라우저
                  저장소에 저장됩니다.
                </>,
              ]}
            />
          </Section>

          <Section title="제3조 (개인정보의 이용 목적)">
            <NumberedList
              items={[
                '회원 식별 및 로그인',
                '게시판·댓글·알림 서비스 제공',
                '신고 처리 및 부정 이용 방지(블랙리스트 운영)',
                '건의사항·이의제기 등 문의 응대',
                '서비스 개선',
              ]}
            />
          </Section>

          <Section title="제4조 (개인정보의 보유 및 파기)">
            <NumberedList
              items={[
                '회원 탈퇴(계정 삭제 요청) 시 해당 이용자의 개인정보를 지체 없이 파기합니다.',
                '알림 기록은 생성 후 60일이 지나면 자동으로 삭제됩니다.',
                '처리가 완료된 건의사항·이의제기는 관리자가 정리할 때 삭제됩니다.',
                '다만, 관련 법령에 따라 보존할 의무가 있는 정보는 해당 법령에서 정한 기간 동안 보관합니다.',
                '전자적 파일 형태의 개인정보는 기록을 재생할 수 없는 기술적 방법으로 삭제합니다.',
              ]}
            />
          </Section>

          <Section title="제5조 (개인정보의 제3자 제공)">
            <p>
              사이트는 이용자의 개인정보를 제3자에게 제공하지 않습니다. 다만, 법령에 특별한 규정이 있거나 수사 목적으로 법령에
              정해진 절차와 방법에 따라 수사기관의 요구가 있는 경우에는 예외로 합니다.
            </p>
          </Section>

          <Section title="제6조 (개인정보 처리의 위탁 및 국외 이전)">
            <p>
              사이트는 원활한 서비스 제공을 위해 다음과 같이 개인정보 처리 업무를 위탁하고 있으며, 수탁자의 서버가 국외에 있어
              개인정보가 국외로 이전됩니다.
            </p>
            {/* 휴대폰에서는 표만 가로로 스크롤 (페이지 전체가 옆으로 밀리지 않도록) */}
            <div className="overflow-x-auto rounded-xl border border-zinc-200 dark:border-zinc-800">
              <table className="w-full min-w-[600px] border-collapse text-xs leading-relaxed [&_td]:align-top">
                <thead>
                  <tr className="bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-white">
                    <th className="px-3 py-2 text-left font-bold border-b border-zinc-200 dark:border-zinc-800">수탁자(이전받는 자)</th>
                    <th className="px-3 py-2 text-left font-bold border-b border-zinc-200 dark:border-zinc-800">국가</th>
                    <th className="px-3 py-2 text-left font-bold border-b border-zinc-200 dark:border-zinc-800">위탁 업무</th>
                    <th className="px-3 py-2 text-left font-bold border-b border-l border-zinc-200 dark:border-zinc-800">이전 항목</th>
                    <th className="px-3 py-2 text-left font-bold border-b border-zinc-200 dark:border-zinc-800">이전 시기·방법</th>
                    <th className="px-3 py-2 text-left font-bold border-b border-zinc-200 dark:border-zinc-800">보유·이용 기간</th>
                  </tr>
                </thead>
                <tbody className="[&>tr:last-child>td]:border-b-0">
                  {PROCESSORS.map((p, i) => (
                    <tr key={p.name}>
                      <td className="px-3 py-2 font-semibold text-zinc-900 dark:text-white border-b border-zinc-200 dark:border-zinc-800 whitespace-nowrap">
                        {p.name}
                      </td>
                      <td className="px-3 py-2 border-b border-zinc-200 dark:border-zinc-800 whitespace-nowrap">{p.country}</td>
                      <td className="px-3 py-2 border-b border-zinc-200 dark:border-zinc-800">{p.task}</td>
                      {/* 이전 항목/시기/기간은 세 수탁자 모두 같음 → 한 칸으로 합침 */}
                      {i === 0 && (
                        <>
                          <td rowSpan={PROCESSORS.length} className="px-3 py-2 border-l border-zinc-200 dark:border-zinc-800">
                            제2조의 수집 항목
                          </td>
                          <td rowSpan={PROCESSORS.length} className="px-3 py-2">
                            서비스 이용 시 네트워크를 통해 수시 전송
                          </td>
                          <td rowSpan={PROCESSORS.length} className="px-3 py-2">
                            회원 탈퇴 또는 위탁 종료 시까지
                          </td>
                        </>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              국외 이전을 원하지 않는 경우 회원 가입을 하지 않거나 계정 삭제를 요청할 수 있으며, 이 경우 로그인이 필요한
              서비스는 이용할 수 없습니다.
            </p>
          </Section>

          <Section title="제7조 (이용자의 권리와 행사 방법)">
            <NumberedList
              items={[
                <>
                  닉네임, 프로필 사진, 한 줄 소개, 정보 공개 범위, 알림 설정은 사이트의 <Label>[마이 프로필 → 개인 설정]</Label>에서
                  직접 변경할 수 있습니다.
                </>,
                '그 밖의 개인정보 열람·정정·삭제·처리정지 요구 및 계정 삭제(회원 탈퇴)는 제11조의 연락처로 요청하면 지체 없이 처리합니다.',
              ]}
            />
          </Section>

          <Section title="제8조 (만 14세 미만 아동의 개인정보)">
            <p>
              만 14세 미만 아동이 회원으로 가입하려면 법정대리인의 동의가 필요합니다. 법정대리인의 동의 없이 가입한 사실이
              확인되면 해당 계정의 개인정보를 파기할 수 있습니다.
            </p>
          </Section>

          <Section title="제9조 (쿠키 등 자동 수집 장치의 운영 및 거부)">
            <NumberedList
              items={[
                '사이트는 광고·추적 목적의 쿠키를 사용하지 않습니다.',
                '로그인 유지와 화면 설정을 위해 브라우저 저장소(localStorage/sessionStorage)를 사용합니다.',
                '이용자는 브라우저 설정에서 저장된 정보를 삭제할 수 있으며, 삭제하면 로그아웃되고 화면 설정이 초기화됩니다.',
              ]}
            />
          </Section>

          <Section title="제10조 (개인정보의 안전성 확보 조치)">
            <NumberedList
              items={[
                '데이터베이스 행 단위 접근 제어 (본인 또는 권한 있는 관리자만 접근)',
                'HTTPS 암호화 전송',
                '게시글 HTML 보안 정화 (악성 스크립트 차단)',
                '관리자 권한 최소화',
              ]}
            />
          </Section>

          <Section title="제11조 (개인정보 보호책임자)">
            <p>
              사이트는 개인정보 처리에 관한 업무를 총괄하고 관련 문의·불만 처리 및 피해 구제를 위해 아래와 같이 개인정보
              보호책임자를 지정하고 있습니다.
            </p>
            <ul className="space-y-1 rounded-xl bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 px-4 py-3">
              <li>
                <Label>개인정보 보호책임자</Label>: 사이트 제작자 사과사과
              </li>
              <li>
                <Label>이메일</Label>:{' '}
                <a
                  href={`mailto:${CONTACT_EMAIL}`}
                  className="font-semibold text-zinc-900 dark:text-white underline underline-offset-2 hover:opacity-70 transition"
                >
                  {CONTACT_EMAIL}
                </a>
              </li>
              <li>
                <Label>사이트 내 문의</Label>: [마이 프로필 → 건의사항]
              </li>
            </ul>
          </Section>

          <Section title="제12조 (권익침해 구제 방법)">
            <p>이용자는 개인정보 침해로 인한 구제를 받기 위해 아래 기관에 분쟁 해결이나 상담 등을 신청할 수 있습니다.</p>
            <ul className="space-y-1">
              {REMEDY_AGENCIES.map((agency) => (
                <li key={agency.name}>
                  <Label>{agency.name}</Label>: <ExternalLink href={`https://${agency.site}`}>{agency.site}</ExternalLink> /{' '}
                  {agency.phone}
                </li>
              ))}
            </ul>
          </Section>

          <Section title="제13조 (개인정보처리방침의 변경)">
            <p>
              이 개인정보처리방침은 {EFFECTIVE_DATE}부터 시행됩니다. 내용이 추가·삭제·수정되는 경우 변경 사항을 사이트를 통해
              안내합니다.
            </p>
          </Section>
        </div>
      </article>
    </div>
  )
}
