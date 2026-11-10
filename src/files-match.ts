interface FilesMatch {
  files: string[];
  dirs: string[];
  excluded: string[];
  extensions: string[];
  contentMappers?: {
    extensions: string[];
  };
}

function isContentMapperFile(file: string, contentMappers: FilesMatch['contentMappers']): boolean {
  return contentMappers?.extensions.some((extension) => file.endsWith(extension)) || false;
}

export { isContentMapperFile };
export type { FilesMatch };
