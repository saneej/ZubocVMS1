import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://bdfgscjiuqccoidkeaqh.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJkZmdzY2ppdXFjY29pZGtlYXFoIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc5MjQwNzQ4OCwiZXhwIjoyMTA3OTgzNDg4fQ.NAQ_B4oLhyLPLlnUeJGc9lJ1NPcO7oH0_e3ZxeAlrF4';

async function test() {
  const client = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  
  const testRecord = {
    orderId: 'TEST-123',
    customerName: 'Test Customer',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    recordingStatus: 'PENDING',
    uploadStatus: 'PENDING'
  };

  console.log('Attempting to insert test record...');
  const { error } = await client.from('orders').upsert(testRecord, { onConflict: 'orderId' });
  
  if (error) {
    console.error('Insert Error:', error.message, error.code, error.details);
  } else {
    console.log('Insert Success!');
  }
}

test();
