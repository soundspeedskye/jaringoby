# 리액션 아이콘 (손그림 이모지)

레퍼런스: 굿네이버스풍 종이 질감 플랫 일러스트. 외곽선 없이 면으로만, 전부 얼굴 달림.

| 파일 | 대응 이모지 | 뜻 |
|---|---|---|
| `loved.svg` | 🥰 | 사랑스러움 |
| `peace.svg` | ✌️ | 브이 |
| `thumbs-up.svg` | 👍 | 좋아요 |
| `smile-tear.svg` | 🥲 | 웃픔 |
| `melting.svg` | 🫠 | 녹는 중 |
| `thinking.svg` | 🤔 | 고민 중 |
| `clap.svg` | 👏 | 박수 |
| `thumbs-down.svg` | 👎 | 싫어요 |
| `heart.svg` | 🩷 | 하트 |

## 규칙
- 캔버스 `viewBox="0 0 100 100"`, 여백 최소 4
- `stroke` 외곽선 없음. 형태는 면(fill)으로만, 디테일선은 같은 색 계열의 어두운 톤
- 눈은 `rx 3.7~4.4 / ry 4.4~5`, 입은 `stroke-width 4~4.8` + `round` 캡
- 볼터치 `#EE7B62` opacity .5

## 팔레트
```
ink    #3B2E23  눈·입
sun    #F5CE3F  얼굴 노랑
hand   #F4C64A  손 노랑
handD  #DFAA36  손 그림자·주름
handB  #DBA22B  뒤쪽 손(박수)
coral  #EA6A4E  하트·효과선
pink   #F58BAA / #FBB8CB  하트
sky    #8FD2EE  눈물
cream  #FFF7E6  소맷단
blush  #EE7B62 @.5
```

## 종이 질감
`preview.html`의 grain 필터(`feTurbulence`)는 **웹 미리보기 전용**이다.
react-native-svg는 `feTurbulence`를 지원하지 않으므로, 앱에서 질감이 필요하면
타일 노이즈 PNG를 `expo-image`로 위에 겹치거나 아이콘을 PNG로 굽는 쪽을 쓴다.
평면(질감 없음) 상태로도 성립하도록 그렸다.

## 미리보기
`preview.html`을 브라우저로 열면 초록 배경 / 크림 종이 / 반응 pill 3가지 맥락에서 확인할 수 있다.
