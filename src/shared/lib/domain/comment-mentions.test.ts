import { describe, expect, it } from "vitest";

import {
  findActiveMention,
  remapMentions,
  replaceActiveMention,
} from "./comment-mentions";

describe("comment mentions", () => {
  it("커서 앞의 @검색어만 멘션 후보로 인식한다", () => {
    expect(findActiveMention("같이 @지", 5)).toEqual({ start: 3, end: 5, query: "지" });
    expect(findActiveMention("이미 @지훈 에게", 9)).toBeNull();
  });

  it("선택한 멤버를 본문과 구조화된 멘션으로 함께 삽입한다", () => {
    const active = findActiveMention("같이 @지", 5);
    expect(active).not.toBeNull();
    expect(replaceActiveMention("같이 @지", active!, { userId: "user-j", nickname: "지훈" }, [])).toEqual({
      body: "같이 @지훈 ",
      cursor: 7,
      mentions: [{ userId: "user-j", start: 3, end: 6, displayName: "지훈" }],
    });
  });

  it("멘션 영역을 수정하면 해당 연결을 해제한다", () => {
    expect(remapMentions("@지훈 응원", "@지후 응원", [
      { userId: "user-j", start: 0, end: 3, displayName: "지훈" },
    ])).toEqual([]);
  });
});
