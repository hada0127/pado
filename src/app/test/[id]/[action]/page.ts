import pado, { getParams } from '@pado';

const params = getParams();
const { id, action } = params;

pado({ id, action, params });