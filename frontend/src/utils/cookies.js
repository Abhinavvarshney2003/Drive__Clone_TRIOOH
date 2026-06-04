export const getCookie = (name) => {
  return localStorage.getItem(name);
};

export const setCookie = (name, value, days = 7) => {
  localStorage.setItem(name, value);
};

export const deleteCookie = (name) => {
  localStorage.removeItem(name);
};
