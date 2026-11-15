export const knowledgeSchema = `
CREATE TABLE document_versions (
  document_key TEXT NOT NULL, version INTEGER NOT NULL CHECK(version BETWEEN 1 AND 10),
  title TEXT NOT NULL CHECK(length(title) BETWEEN 1 AND 160), source_hash TEXT NOT NULL CHECK(length(source_hash)=64),
  page_count INTEGER NOT NULL CHECK(page_count BETWEEN 1 AND 100), empty_pages TEXT NOT NULL,
  imported_at TEXT NOT NULL, parser_version TEXT NOT NULL CHECK(parser_version='pdfjs-6.5.438'), PRIMARY KEY(document_key,version)
) STRICT;
CREATE TABLE current_documents (
  document_key TEXT PRIMARY KEY NOT NULL, version INTEGER NOT NULL,
  FOREIGN KEY(document_key,version) REFERENCES document_versions(document_key,version)
) STRICT;
CREATE TABLE embedding_indexes (
  index_key TEXT PRIMARY KEY NOT NULL, identity TEXT NOT NULL
) STRICT;
CREATE TABLE document_indexes (
  index_key TEXT NOT NULL REFERENCES embedding_indexes(index_key), document_key TEXT NOT NULL, version INTEGER NOT NULL,
  chunk_count INTEGER NOT NULL CHECK(chunk_count BETWEEN 1 AND 1000), PRIMARY KEY(index_key,document_key,version),
  FOREIGN KEY(document_key,version) REFERENCES document_versions(document_key,version)
) STRICT;
CREATE TABLE document_chunks (
  index_key TEXT NOT NULL, document_key TEXT NOT NULL, version INTEGER NOT NULL, ordinal INTEGER NOT NULL,
  chunk_id TEXT NOT NULL UNIQUE, page INTEGER NOT NULL CHECK(page BETWEEN 1 AND 100),
  text TEXT NOT NULL CHECK(length(text) BETWEEN 1 AND 1000), vector BLOB NOT NULL,
  PRIMARY KEY(index_key,document_key,version,ordinal),
  FOREIGN KEY(index_key,document_key,version) REFERENCES document_indexes(index_key,document_key,version)
) STRICT;`;

export const knowledgeColumns: Record<string, string> = {
  schema_migrations: 'version:INTEGER,name:TEXT,applied_at:TEXT',
  document_versions: 'document_key:TEXT,version:INTEGER,title:TEXT,source_hash:TEXT,page_count:INTEGER,empty_pages:TEXT,imported_at:TEXT,parser_version:TEXT',
  current_documents: 'document_key:TEXT,version:INTEGER',
  embedding_indexes: 'index_key:TEXT,identity:TEXT',
  document_indexes: 'index_key:TEXT,document_key:TEXT,version:INTEGER,chunk_count:INTEGER',
  document_chunks: 'index_key:TEXT,document_key:TEXT,version:INTEGER,ordinal:INTEGER,chunk_id:TEXT,page:INTEGER,text:TEXT,vector:BLOB',
};
