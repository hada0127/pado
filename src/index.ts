import pado from '../pado/pado';

export let a: number = 1;
export let b: string = 'hello';
export let c: { name: string; age: number } = { name: 'pado', age: 18 };
export let d: number[] = [1];
export let e: string = 'ready';
export let checkboxValue: boolean = true;
export let radioValue: number = 1;

// 초기 렌더링
pado({ a, b, c, d, e, checkboxValue, radioValue });

// 핸들러 정의
const updateData = () => { 
  b = `hello ${a}`;
  c.name = `<span style="color: red;">pado ${a}</span>`;
  d.push(a);
  pado({ b, c, d });
}
export const buttonClickHandler = () => {
  a++;
  e = "clicked";
  updateData();

  pado({ a, e });
};

export const inputChangeHandler = (element: HTMLInputElement) => {
  a = Number(element.value);
  updateData();
  pado({ a });
};

export const textareaChangeHandler = (element: HTMLTextAreaElement) => {
  e = element.value;
  pado({ e });
};

export const selectChangeHandler = (element: HTMLSelectElement) => {
  a = Number(element.value);
  pado({ a });
};

export const checkboxChangeHandler = (element: HTMLInputElement) => {
  checkboxValue = element.checked;
  pado({ checkboxValue });
};

export const radioChangeHandler = (element: HTMLInputElement) => {
  radioValue = Number(element.value);
  pado({ radioValue });
};
