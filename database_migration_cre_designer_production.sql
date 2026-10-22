-- ==============================================================================
-- ZUBOC FLOW: COMPLETE UNIFIED ALL-IN-ONE SQL MIGRATION
-- Compatible with PostgreSQL 13+ / Supabase PostgreSQL
-- Run this single script in Supabase SQL Editor
-- ==============================================================================

BEGIN;

-- 1. Ensure UUID Extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. Update existing staffs table (roles, isActive, phone, email, lastLoginAt)
ALTER TABLE public.staffs 
  ADD COLUMN IF NOT EXISTS "isActive" BOOLEAN DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS "email" TEXT,
  ADD COLUMN IF NOT EXISTS "phone" TEXT,
  ADD COLUMN IF NOT EXISTS "lastLoginAt" TIMESTAMPTZ;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'staffs_role_check'
  ) THEN
    ALTER TABLE public.staffs DROP CONSTRAINT staffs_role_check;
  END IF;
END $$;

ALTER TABLE public.staffs 
  ADD CONSTRAINT staffs_role_check 
  CHECK (role IN ('ADMIN', 'CRE', 'DESIGNER', 'PRODUCTION', 'SUPERVISOR', 'PACKER'));

-- 3. Department Order Workflow Table
CREATE TABLE IF NOT EXISTS public.department_order_workflow (
  "orderId" TEXT PRIMARY KEY,
  "isDesignRequired" BOOLEAN DEFAULT FALSE,
  "workflowStatus" TEXT NOT NULL DEFAULT 'CRE_CREATED',
  "priority" TEXT NOT NULL DEFAULT 'NORMAL',
  "designInstructions" TEXT,
  "assignedDesignerId" TEXT,
  "assignedDesignerName" TEXT,
  "assignedAt" TIMESTAMPTZ,
  "currentRevisionNumber" INTEGER DEFAULT 1,
  "activeDesignFiles" JSONB DEFAULT '[]'::jsonb,
  "creAttachments" JSONB DEFAULT '[]'::jsonb,
  "forwardedToDesignAt" TIMESTAMPTZ,
  "forwardedByStaffId" TEXT,
  "forwardedByStaffName" TEXT,
  "designSubmittedAt" TIMESTAMPTZ,
  "productionStartedAt" TIMESTAMPTZ,
  "productionStartedByStaffId" TEXT,
  "productionStartedByStaffName" TEXT,
  "productionCompletedAt" TIMESTAMPTZ,
  "productionCompletedByStaffId" TEXT,
  "productionCompletedByStaffName" TEXT,
  "productionRemarks" TEXT,
  "clarificationRequest" JSONB,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'workflow_status_check'
  ) THEN
    ALTER TABLE public.department_order_workflow DROP CONSTRAINT workflow_status_check;
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'workflow_priority_check'
  ) THEN
    ALTER TABLE public.department_order_workflow DROP CONSTRAINT workflow_priority_check;
  END IF;
END $$;

ALTER TABLE public.department_order_workflow 
  ADD CONSTRAINT workflow_status_check 
  CHECK ("workflowStatus" IN (
    'CRE_CREATED',
    'DESIGN_PENDING',
    'DESIGN_ASSIGNED',
    'DESIGN_IN_PROGRESS',
    'DESIGN_REVISION_REQUESTED',
    'DESIGN_SUBMITTED',
    'PRODUCTION_PENDING',
    'PRODUCTION_IN_PROGRESS',
    'PRODUCTION_REVISION_REQUESTED',
    'PRODUCTION_COMPLETED'
  ));

ALTER TABLE public.department_order_workflow 
  ADD CONSTRAINT workflow_priority_check 
  CHECK ("priority" IN ('LOW', 'NORMAL', 'HIGH', 'URGENT'));

CREATE INDEX IF NOT EXISTS idx_workflow_status ON public.department_order_workflow ("workflowStatus");
CREATE INDEX IF NOT EXISTS idx_workflow_designer ON public.department_order_workflow ("assignedDesignerId");
CREATE INDEX IF NOT EXISTS idx_workflow_priority ON public.department_order_workflow ("priority");

-- 4. Design Revisions Table
CREATE TABLE IF NOT EXISTS public.design_revisions (
  "id" TEXT PRIMARY KEY DEFAULT ('rev_' || uuid_generate_v4()::text),
  "orderId" TEXT NOT NULL,
  "revisionNumber" INTEGER NOT NULL,
  "designerId" TEXT NOT NULL,
  "designerName" TEXT NOT NULL,
  "designNotes" TEXT,
  "files" JSONB DEFAULT '[]'::jsonb,
  "status" TEXT NOT NULL DEFAULT 'SUBMITTED',
  "submittedAt" TIMESTAMPTZ DEFAULT NOW(),
  "revisionRequestedBy" TEXT,
  "revisionReason" TEXT,
  "revisionRequestedAt" TIMESTAMPTZ,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_design_revisions_order ON public.design_revisions ("orderId", "revisionNumber");

-- 5. Order Attachments Table
CREATE TABLE IF NOT EXISTS public.order_attachments (
  "id" TEXT PRIMARY KEY DEFAULT ('att_' || uuid_generate_v4()::text),
  "orderId" TEXT NOT NULL,
  "fileName" TEXT NOT NULL,
  "fileType" TEXT,
  "fileSize" BIGINT,
  "fileUrl" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "revisionNumber" INTEGER,
  "uploadedByStaffId" TEXT,
  "uploadedByStaffName" TEXT,
  "notes" TEXT,
  "uploadedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_order_attachments_order ON public.order_attachments ("orderId");

-- 6. Workflow Audit Logs Table
CREATE TABLE IF NOT EXISTS public.workflow_audit_logs (
  "id" TEXT PRIMARY KEY DEFAULT ('wal_' || uuid_generate_v4()::text),
  "orderId" TEXT NOT NULL,
  "actorId" TEXT,
  "actorName" TEXT,
  "actorRole" TEXT,
  "action" TEXT NOT NULL,
  "fromStatus" TEXT,
  "toStatus" TEXT,
  "details" TEXT,
  "timestamp" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_workflow_audit_order ON public.workflow_audit_logs ("orderId");

-- 7. Atomic Concurrency Order Acceptance Stored Procedure
CREATE OR REPLACE FUNCTION public.accept_design_order(
  p_order_id TEXT,
  p_designer_id TEXT,
  p_designer_name TEXT
)
RETURNS TABLE (
  success BOOLEAN,
  message TEXT,
  assigned_order JSONB
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_current_status TEXT;
  v_current_designer TEXT;
  v_updated_record RECORD;
BEGIN
  -- Row-level lock to prevent concurrent races
  SELECT "workflowStatus", "assignedDesignerId"
  INTO v_current_status, v_current_designer
  FROM public.department_order_workflow
  WHERE "orderId" = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT FALSE, 'Order workflow record not found', NULL::JSONB;
    RETURN;
  END IF;

  IF v_current_designer IS NOT NULL AND v_current_designer <> '' AND v_current_designer <> p_designer_id THEN
    RETURN QUERY SELECT FALSE, 'This order has already been assigned to another Designer.', NULL::JSONB;
    RETURN;
  END IF;

  UPDATE public.department_order_workflow
  SET 
    "workflowStatus" = 'DESIGN_ASSIGNED',
    "assignedDesignerId" = p_designer_id,
    "assignedDesignerName" = p_designer_name,
    "assignedAt" = NOW(),
    "updatedAt" = NOW()
  WHERE "orderId" = p_order_id
  RETURNING * INTO v_updated_record;

  INSERT INTO public.workflow_audit_logs (
    "orderId", "actorId", "actorName", "actorRole", "action", "fromStatus", "toStatus", "details", "timestamp"
  ) VALUES (
    p_order_id, p_designer_id, p_designer_name, 'DESIGNER', 'ACCEPT_ORDER', v_current_status, 'DESIGN_ASSIGNED',
    'Order accepted and assigned to ' || p_designer_name, NOW()
  );

  RETURN QUERY SELECT TRUE, 'Order accepted successfully', to_jsonb(v_updated_record);
END;
$$;

-- 8. Seed Initial Accounts
INSERT INTO public.staffs ("id", "name", "role", "stationId", "password", "isActive", "createdAt")
VALUES 
  ('cre-01', 'Chloe CRE', 'CRE', 'CRE-HQ', 'password123', TRUE, NOW()),
  ('designer-01', 'Dan Designer', 'DESIGNER', 'Design-Studio', 'password123', TRUE, NOW()),
  ('designer-02', 'Diana CAD', 'DESIGNER', 'Design-Studio', 'password123', TRUE, NOW()),
  ('production-01', 'Peter Production', 'PRODUCTION', 'Plant-01', 'password123', TRUE, NOW())
ON CONFLICT ("id") DO UPDATE 
SET "role" = EXCLUDED."role", "isActive" = TRUE;

COMMIT;
