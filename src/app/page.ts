import pado from '@pado';

let counterValue: number = 0;
let textValue: string = '';
let numberValue: number = 0;
let dateValue: string = new Date().toISOString().split('T')[0];
let timeValue: string = new Date().toISOString().split('T')[1].slice(0, 5);
let datetimeLocalValue: string = new Date().toISOString().slice(0, 16);
let rangeValue: number = 50;
let textareaValue: string = '';
let selectValue: number = 1;
let checkboxValue: boolean = true;
let radioValue: number = 1;
let disabledValue: boolean = false;
let readonlyValue: boolean = false;
let ifValue: number = 1;
let ifValue2: string = 'a';
let loopValue: number[] = [1, 2, 3];
let loopValue2: {
  name: string;
  age: number;  
}[] = [{ name: 'John', age: 16 }, { name: 'Jane', age: 21 }];

// 초기 렌더링
pado({ counterValue, textValue, numberValue, dateValue, timeValue, datetimeLocalValue, rangeValue, textareaValue, selectValue, checkboxValue, radioValue, disabledValue, readonlyValue, ifValue, ifValue2, loopValue, loopValue2 });

// 핸들러 정의

export const counterIncreaseHandler = () => {
  counterValue++;
  pado({ counterValue, numberValue });
};

export const counterDecreaseHandler = () => {
  counterValue--;
  pado({ counterValue, numberValue });
};

export const inputTextHandler = (element: HTMLInputElement) => {
  textValue = element.value;
  pado({ textValue });
};

export const numberHandler = (element: HTMLInputElement) => {
  numberValue = Number(element.value);
  pado({ counterValue, numberValue });
};

export const dateHandler = (element: HTMLInputElement) => {
  dateValue = element.value;
  pado({ dateValue });
};

export const timeHandler = (element: HTMLInputElement) => {
  timeValue = element.value;
  pado({ timeValue });
};

export const datetimeLocalHandler = (element: HTMLInputElement) => {
  datetimeLocalValue = element.value;
  pado({ datetimeLocalValue });
};

export const rangeHandler = (element: HTMLInputElement) => {
  rangeValue = Number(element.value);
  pado({ rangeValue });
};

export const textareaHandler = (element: HTMLTextAreaElement) => {
  textareaValue = element.value;
  pado({ textareaValue });
};

export const selectHandler = (element: HTMLSelectElement) => {
  selectValue = Number(element.value);
  pado({ selectValue });
};

export const checkboxHandler = (element: HTMLInputElement) => {
  checkboxValue = element.checked;
  pado({ checkboxValue });
};

export const radioHandler = (element: HTMLInputElement) => {
  radioValue = Number(element.value);
  pado({ radioValue });
};

export const disabledHandler = (element: HTMLInputElement) => {
  disabledValue = element.checked;
  pado({ disabledValue });
};

export const readonlyHandler = (element: HTMLInputElement) => {
  readonlyValue = element.checked;
  pado({ readonlyValue });
};

export const ifHandler = (element: HTMLInputElement) => {
  ifValue = Number(element.value);
  pado({ loopValue, loopValue2, ifValue, ifValue2 });
};

export const if2Handler = (element: HTMLInputElement) => {
  ifValue2 = element.value;
  pado({ loopValue, loopValue2, ifValue, ifValue2 });
};

export const loopHandler = () => {
  // add item
  loopValue.push(loopValue.length + 1);
  pado({ loopValue, loopValue2, ifValue, ifValue2 });
};

export const loop2Handler = () => {
  // add item
  loopValue2.push({ name: 'John', age: 20 });
  pado({ loopValue, loopValue2, ifValue, ifValue2 });
};
