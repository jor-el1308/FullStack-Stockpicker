-- Owner 1: Person 1 (Yong Wee) - AI Analysis Recommendation History

-- Persists each AI analysis run so users can view history of analysis and past results
-- instead of losing them the moment they navigate away

CREATE TABLE IF NOT EXISTS ai_analysis (
  id            CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  user_id       CHAR(36) NOT NULL,
  -- The shortlisted stocks sent to the model, kept so the history page can
  -- show what was analyzed without re-joining against live screener data.
  stocks        JSON NOT NULL,
  analysis_text MEDIUMTEXT NOT NULL,
  created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_ai_analysis_user FOREIGN KEY (user_id)
    REFERENCES users (id) ON DELETE CASCADE,
  INDEX idx_ai_analysis_user_created (user_id, created_at)
) ENGINE=InnoDB;