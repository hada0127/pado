import pado, { getParams } from '@pado';

const params = getParams();
const { id } = params;

console.log(id); // URL의 id 값 출력

pado({ id });