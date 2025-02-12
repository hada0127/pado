import pado, { getParams } from '@pado';

const params = getParams();
const { id, action } = params;

console.log(id); // URL의 id 값 출력

pado({ id, action, params });