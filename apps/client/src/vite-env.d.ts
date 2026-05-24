/// <reference types="vite/client" />

declare namespace React {
  interface InputHTMLAttributes<T> {
    webkitdirectory?: boolean | string;
    directory?: string;
  }
}
