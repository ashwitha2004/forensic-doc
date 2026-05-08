-- Create SQL functions as a workaround for schema cache issues
-- These functions will be callable via RPC endpoint

-- Function to get all biometric users
CREATE OR REPLACE FUNCTION get_all_biometric_users()
RETURNS TABLE (
    id BIGINT,
    user_id TEXT,
    device_token TEXT,
    webauthn_credential JSONB,
    face_embedding FLOAT8[],
    is_active BOOLEAN,
    created_at TIMESTAMP WITH TIME ZONE,
    updated_at TIMESTAMP WITH TIME ZONE
) AS $$
BEGIN
    RETURN QUERY SELECT 
        bu.id, bu.user_id, bu.device_token, bu.webauthn_credential, 
        bu.face_embedding, bu.is_active, bu.created_at, bu.updated_at
    FROM biometric_users bu;
END;
$$ LANGUAGE plpgsql;

-- Function to get user by ID
CREATE OR REPLACE FUNCTION get_biometric_user(p_user_id TEXT)
RETURNS TABLE (
    id BIGINT,
    user_id TEXT,
    device_token TEXT,
    webauthn_credential JSONB,
    face_embedding FLOAT8[],
    is_active BOOLEAN,
    created_at TIMESTAMP WITH TIME ZONE,
    updated_at TIMESTAMP WITH TIME ZONE
) AS $$
BEGIN
    RETURN QUERY SELECT 
        bu.id, bu.user_id, bu.device_token, bu.webauthn_credential, 
        bu.face_embedding, bu.is_active, bu.created_at, bu.updated_at
    FROM biometric_users bu
    WHERE bu.user_id = p_user_id;
END;
$$ LANGUAGE plpgsql;

-- Function to insert a biometric user
CREATE OR REPLACE FUNCTION insert_biometric_user(
    p_user_id TEXT,
    p_device_token TEXT,
    p_webauthn_credential JSONB,
    p_face_embedding FLOAT8[]
)
RETURNS TABLE (
    id BIGINT,
    user_id TEXT,
    success BOOLEAN
) AS $$
DECLARE
    v_id BIGINT;
BEGIN
    INSERT INTO biometric_users (user_id, device_token, webauthn_credential, face_embedding)
    VALUES (p_user_id, p_device_token, p_webauthn_credential, p_face_embedding)
    RETURNING biometric_users.id INTO v_id;
    
    RETURN QUERY SELECT v_id, p_user_id, true;
END;
$$ LANGUAGE plpgsql;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION get_all_biometric_users() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION get_biometric_user(TEXT) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION insert_biometric_user(TEXT, TEXT, JSONB, FLOAT8[]) TO anon, authenticated, service_role;

-- Test the functions
SELECT * FROM get_all_biometric_users() LIMIT 1;
