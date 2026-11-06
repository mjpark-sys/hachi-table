// 직접 입력 문장 검사 (서버에서만 사용). 목록은 보수적으로 시작했고, 운영하면서 늘려 가세요.
// 방식: 공백·특수문자를 지운 뒤(띄어쓰기 우회 방지) 금칙어 포함 여부를 검사하고,
//       같은 글자 반복을 접은 형태도 한 번 더 검사합니다(씨이이발 등).

const BAD_WORDS = [
  // 욕설
  '시발', '씨발', '시팔', '씨팔', '씹', 'ㅅㅂ', 'ㅆㅂ', 'ㅂㅅ', 'ㅄ', '병신', '븅신', '지랄', 'ㅈㄹ', '좆', '존나', 'ㅈㄴ',
  '개새', '새끼', '쌔끼', '썅', '쌍년', '미친년', '미친놈', '꺼져', '닥쳐', '엿먹', '느금', '니미', '네미', '애미', '패드립',
  // 혐오·비하
  '한남', '김치녀', '된장녀', '맘충', '틀딱', '창녀', '찐따',
  // 성적 표현
  '섹스', '야동', '자지', '꼴리', '딸딸',
  // 자해·폭력
  '자살', '죽여', '죽일', '디져', '뒤질래',
  // 외부 연락 유도(개인정보 보호)
  '카톡', '카카오톡', '오픈채팅', '오픈카톡', '텔레그램', '라인아이디', '인스타', '아이디줄', '번호줄', '닷컴', '점컴',
  // 영어
  'fuck', 'shit', 'bitch', 'asshole', 'pussy', 'nigg', 'cunt'
];

const norm = s => String(s).normalize('NFKC').toLowerCase().replace(/[^0-9a-z가-힣ㄱ-ㅎㅏ-ㅣ\u1100-\u11ff]/g, '');
const collapse = s => s.replace(/(.)\1+/g, '$1');

function isBad(text) {
  const raw = String(text).normalize('NFKC').toLowerCase();
  if (/(https?:|www\.|\.(com|net|kr|io|me|co|org|gg|ly|app|xyz)\b|@)/.test(raw)) return true;   // 링크·이메일
  if ((raw.match(/[0-9]/g) || []).length >= 7) return true;                                    // 전화번호 형태
  const a = norm(raw), b = collapse(a);
  for (const w of BAD_WORDS) {
    const n = norm(w);
    if (!n) continue;
    if (a.includes(n) || b.includes(collapse(n))) return true;
  }
  return false;
}

module.exports = { isBad, BAD_WORDS };
