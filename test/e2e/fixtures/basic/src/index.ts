import { add } from './math';

const result = add(1, 2);

if (typeof document !== 'undefined') {
  document.body.innerHTML = `<main>${result}</main>`;
}

export { result };
