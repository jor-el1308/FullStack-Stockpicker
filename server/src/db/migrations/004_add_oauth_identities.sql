-- Person 1 (Yong Wee) - added for OAuth Login Support (Google / Microsoft)

ALTER TABLE users MODIFY password_hash VARCHAR(255) NULL;

CREATE TABLE IF NOT EXISTS oauth_identity (
  id                CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  user_id           CHAR(36) NOT NULL,
  provider          VARCHAR(32) NOT NULL,      -- 'google' | 'microsoft'
  provider_user_id  VARCHAR(255) NOT NULL,     -- the 'sub' claim from the ID token
  email             VARCHAR(255) NOT NULL,
  created_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_oauth_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE KEY uq_provider_identity (provider, provider_user_id)
) ENGINE=InnoDB;

