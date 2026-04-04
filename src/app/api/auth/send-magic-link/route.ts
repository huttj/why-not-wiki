import { createAdminClient } from "@/lib/supabase/admin";
import { Resend } from "resend";
import { NextResponse, type NextRequest } from "next/server";

const resend = new Resend(process.env.RESEND_API_KEY);

export async function POST(request: NextRequest) {
  const { email, redirectTo } = await request.json();

  if (!email || typeof email !== "string") {
    return NextResponse.json({ error: "Email is required" }, { status: 400 });
  }

  const supabase = createAdminClient();
  if (!supabase) {
    return NextResponse.json(
      { error: "Server configuration error" },
      { status: 500 }
    );
  }

  const { data, error } = await supabase.auth.admin.generateLink({
    type: "magiclink",
    email,
    options: {
      redirectTo,
    },
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  const magicLink = data.properties.action_link;

  const { error: sendError } = await resend.emails.send({
    from: process.env.EMAIL_FROM || "WhyNot <noreply@whynot.wiki>",
    to: email,
    subject: "Sign in to WhyNot",
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 40px 20px;">
        <h1 style="font-size: 24px; color: #111827; margin-bottom: 8px;">
          Why<span style="color: #4f46e5;">Not</span>?
        </h1>
        <p style="color: #6b7280; font-size: 16px; line-height: 1.5; margin-bottom: 24px;">
          Click the button below to sign in. This link expires in 1 hour.
        </p>
        <a href="${magicLink}" style="display: inline-block; background-color: #4f46e5; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 500; font-size: 16px;">
          Sign in to WhyNot
        </a>
        <p style="color: #9ca3af; font-size: 14px; margin-top: 24px;">
          If you didn't request this email, you can safely ignore it.
        </p>
      </div>
    `,
  });

  if (sendError) {
    return NextResponse.json(
      { error: "Failed to send email" },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true });
}
