import pado, { getParams } from '@pado';

const params = getParams();
const param = JSON.stringify(params);

console.log(param);
pado({ param });
