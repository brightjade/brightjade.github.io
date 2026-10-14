// 단계 재생 공용 로직. 3Blue1Brown식으로 한 단계씩 넘기며 캡션과 그림을 바꾼다.
function makeStepper(steps, onChange) {
  let i = 0;
  const go = j => { i = Math.max(0, Math.min(steps.length - 1, j)); onChange(i); };
  return { go, next: () => go(i + 1), prev: () => go(i - 1), index: () => i };
}
