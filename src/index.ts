import pado from './pado.ts';

export let a: number = 1;
export let b: string = 'hello';
export let c: { name: string; age: number } = { name: 'pado', age: 18 };
export let d: number[] = [1];
export let e: string = 'ready';

// 초기 렌더링
pado(a, b, c, d, e);

// 핸들러 정의
export const buttonClickHandler = () => {
  a++;
  b = `hello ${a}`;
  c.name = `pado ${a}`;
  d.push(a);
  pado(a, b, c, d);
};

export const inputChangeHandler = (element: HTMLInputElement) => {
  a = Number(element.value);
  b = `hello ${a}`;
  c.name = `pado ${a}`;
  d.push(a);
  pado(a);
};

export const textareaChangeHandler = (element: HTMLTextAreaElement) => {
  e = element.value;
  pado(e);
};
