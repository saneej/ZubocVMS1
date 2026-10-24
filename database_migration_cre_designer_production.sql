-- ==============================================================================
-- ZUBOC FLOW: COMPLETE UNIFIED ALL-IN-ONE SQL MIGRATION
-- Compatible with PostgreSQL 13+ / Supabase PostgreSQL
-- Run this single script in Supabase SQL Editor
-- ==============================================================================

BEGIN;

-- 1. Ensure UUID Extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. Staffs Table (roles, isActive, phone, email, lastLoginAt)
CREATE TABLE IF NOT EXISTS public.staffs (
  "id" TEXT PRIMARY KEY,
  "name" TEXT NOT NULL,
  "role" TEXT NOT NULL DEFAULT 'CRE',
  "stationId" TEXT NOT NULL DEFAULT 'Main',
  "password" TEXT,
  "email" TEXT,
  "phone" TEXT,
  "isActive" BOOLEAN DEFAULT TRUE,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "lastLoginAt" TIMESTAMPTZ
);

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

-- 3. Core Orders Table
CREATE TABLE IF NOT EXISTS public.orders (
  "orderId" TEXT PRIMARY KEY,
  "orderSource" TEXT DEFAULT 'website',
  "order_source" TEXT DEFAULT 'website',
  "order_number_num" BIGINT,
  "customerName" TEXT,
  "productSku" TEXT,
  "itemCount" TEXT DEFAULT '1',
  "courier" TEXT,
  "deliveryMethod" TEXT DEFAULT 'Normal',
  "awbNumber" TEXT,
  "weight" TEXT,
  "orderReceivedDate" TEXT,
  "dispatchDate" TEXT,
  "orderAmount" TEXT,
  "shippingAmount" TEXT,
  "orderTotal" TEXT,
  "deliveredDate" TEXT,
  "notes" TEXT,
  "remarks" TEXT,
  "fulfillmentStatus" TEXT DEFAULT 'Pending',
  "recordingStatus" TEXT DEFAULT 'PENDING',
  "uploadStatus" TEXT DEFAULT 'PENDING',
  "isProductionDeckOrder" BOOLEAN DEFAULT TRUE,
  "isDispatched" BOOLEAN DEFAULT FALSE,
  "is_dispatched" BOOLEAN DEFAULT FALSE,
  "isDesignRequired" BOOLEAN DEFAULT FALSE,
  "workflowStatus" TEXT DEFAULT 'CRE_CREATED',
  "assignedDesignerId" TEXT,
  "assignedDesignerName" TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. Department Order Workflow Table
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
  "creApprovedAt" TIMESTAMPTZ,
  "creApprovedByStaffId" TEXT,
  "creApprovedByStaffName" TEXT,
  "creApprovalNotes" TEXT,
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

-- Ensure all new columns exist
ALTER TABLE public.department_order_workflow
  ADD COLUMN IF NOT EXISTS "creApprovedAt" TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS "creApprovedByStaffId" TEXT,
  ADD COLUMN IF NOT EXISTS "creApprovedByStaffName" TEXT,
  ADD COLUMN IF NOT EXISTS "creApprovalNotes" TEXT;

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
    'CRE_REVIEW_PENDING',
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

-- 5. Design Revisions Table
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

-- 6. Order Attachments Table (Cloudflare R2 + Local files metadata)
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

-- 7. Workflow Audit Logs Table
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

-- 8. Stored Procedure: Atomic Concurrency Order Acceptance
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
  -- Row-level lock to prevent concurrent races between designers
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

-- 9. Stored Procedure: Designer Submit to CRE for Review
CREATE OR REPLACE FUNCTION public.submit_design_to_cre(
  p_order_id TEXT,
  p_designer_id TEXT,
  p_designer_name TEXT,
  p_design_notes TEXT,
  p_files JSONB
)
RETURNS TABLE (
  success BOOLEAN,
  message TEXT,
  updated_workflow JSONB
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_current_status TEXT;
  v_rev_num INT;
  v_updated RECORD;
BEGIN
  SELECT "workflowStatus", COALESCE("currentRevisionNumber", 1)
  INTO v_current_status, v_rev_num
  FROM public.department_order_workflow
  WHERE "orderId" = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT FALSE, 'Order workflow record not found', NULL::JSONB;
    RETURN;
  END IF;

  v_rev_num := v_rev_num + 1;

  UPDATE public.department_order_workflow
  SET
    "workflowStatus" = 'DESIGN_SUBMITTED',
    "currentRevisionNumber" = v_rev_num,
    "activeDesignFiles" = p_files,
    "designSubmittedAt" = NOW(),
    "clarificationRequest" = NULL,
    "updatedAt" = NOW()
  WHERE "orderId" = p_order_id
  RETURNING * INTO v_updated;

  INSERT INTO public.design_revisions (
    "orderId", "revisionNumber", "designerId", "designerName", "designNotes", "files", "status", "submittedAt"
  ) VALUES (
    p_order_id, v_rev_num, p_designer_id, p_designer_name, p_design_notes, p_files, 'SUBMITTED_TO_CRE', NOW()
  );

  INSERT INTO public.workflow_audit_logs (
    "orderId", "actorId", "actorName", "actorRole", "action", "fromStatus", "toStatus", "details", "timestamp"
  ) VALUES (
    p_order_id, p_designer_id, p_designer_name, 'DESIGNER', 'SUBMIT_TO_CRE', v_current_status, 'DESIGN_SUBMITTED',
    'Design Revision #' || v_rev_num || ' submitted to CRE for review', NOW()
  );

  RETURN QUERY SELECT TRUE, 'Design successfully submitted to CRE for review', to_jsonb(v_updated);
END;
$$;

-- 10. Stored Procedure: CRE Approve Design & Send to Production
CREATE OR REPLACE FUNCTION public.cre_approve_design(
  p_order_id TEXT,
  p_staff_id TEXT,
  p_staff_name TEXT,
  p_production_instructions TEXT DEFAULT '',
  p_priority TEXT DEFAULT 'NORMAL'
)
RETURNS TABLE (
  success BOOLEAN,
  message TEXT,
  updated_workflow JSONB
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_current_status TEXT;
  v_updated RECORD;
BEGIN
  SELECT "workflowStatus"
  INTO v_current_status
  FROM public.department_order_workflow
  WHERE "orderId" = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT FALSE, 'Order workflow record not found', NULL::JSONB;
    RETURN;
  END IF;

  UPDATE public.department_order_workflow
  SET
    "workflowStatus" = 'PRODUCTION_PENDING',
    "priority" = COALESCE(p_priority, "priority"),
    "productionRemarks" = COALESCE(p_production_instructions, "productionRemarks"),
    "creApprovedAt" = NOW(),
    "creApprovedByStaffId" = p_staff_id,
    "creApprovedByStaffName" = p_staff_name,
    "creApprovalNotes" = p_production_instructions,
    "updatedAt" = NOW()
  WHERE "orderId" = p_order_id
  RETURNING * INTO v_updated;

  UPDATE public.orders
  SET
    "workflowStatus" = 'PRODUCTION_PENDING',
    "updatedAt" = NOW()
  WHERE "orderId" = p_order_id;

  INSERT INTO public.workflow_audit_logs (
    "orderId", "actorId", "actorName", "actorRole", "action", "fromStatus", "toStatus", "details", "timestamp"
  ) VALUES (
    p_order_id, p_staff_id, p_staff_name, 'CRE', 'CRE_APPROVE_TO_PRODUCTION', v_current_status, 'PRODUCTION_PENDING',
    'Design approved by CRE (' || p_staff_name || ') and forwarded to Production floor', NOW()
  );

  RETURN QUERY SELECT TRUE, 'Design approved and forwarded to Production department', to_jsonb(v_updated);
END;
$$;

-- 11. Row-Level Security (RLS) Permissive Policies
ALTER TABLE public.staffs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.department_order_workflow ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.design_revisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workflow_audit_logs ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  -- Permissive policy for staffs
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'staffs' AND policyname = 'Allow all access to staffs') THEN
    CREATE POLICY "Allow all access to staffs" ON public.staffs FOR ALL USING (true) WITH CHECK (true);
  END IF;

  -- Permissive policy for orders
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'orders' AND policyname = 'Allow all access to orders') THEN
    CREATE POLICY "Allow all access to orders" ON public.orders FOR ALL USING (true) WITH CHECK (true);
  END IF;

  -- Permissive policy for department_order_workflow
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'department_order_workflow' AND policyname = 'Allow all access to department_order_workflow') THEN
    CREATE POLICY "Allow all access to department_order_workflow" ON public.department_order_workflow FOR ALL USING (true) WITH CHECK (true);
  END IF;

  -- Permissive policy for design_revisions
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'design_revisions' AND policyname = 'Allow all access to design_revisions') THEN
    CREATE POLICY "Allow all access to design_revisions" ON public.design_revisions FOR ALL USING (true) WITH CHECK (true);
  END IF;

  -- Permissive policy for order_attachments
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'order_attachments' AND policyname = 'Allow all access to order_attachments') THEN
    CREATE POLICY "Allow all access to order_attachments" ON public.order_attachments FOR ALL USING (true) WITH CHECK (true);
  END IF;

  -- Permissive policy for workflow_audit_logs
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'workflow_audit_logs' AND policyname = 'Allow all access to workflow_audit_logs') THEN
    CREATE POLICY "Allow all access to workflow_audit_logs" ON public.workflow_audit_logs FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;

-- 12. Clean up any fake users and ensure Admin is preserved
DELETE FROM public.staffs 
WHERE "id" IN ('cre-01', 'designer-01', 'designer-02', 'production-01', 'admin-01', 'Operator-01', 'Staff-01', 'Staff-02', 'Zuboc', '<UUID_FROM_AUTH>');

INSERT INTO public.staffs ("id", "name", "role", "stationId", "password", "email", "isActive", "createdAt")
VALUES 
  ('795afba9-4494-4dde-a238-0f036b1aa726', 'Saneej', 'ADMIN', 'HQ', 'password123', 'msaneejk@gmail.com', TRUE, NOW())
ON CONFLICT ("id") DO UPDATE 
SET "role" = 'ADMIN', "isActive" = TRUE;

COMMIT;
