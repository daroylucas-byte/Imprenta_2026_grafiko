import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { supabase } from '../lib/supabase';
import toast from 'react-hot-toast';

const registerSchema = z.object({
  fullName: z.string().min(2, 'El nombre es demasiado corto'),
  email: z.string().email('Correo electrónico no válido'),
  password: z.string().min(6, 'La contraseña debe tener al menos 6 caracteres'),
  confirmPassword: z.string(),
  terms: z.boolean().refine(val => val === true, {
    message: 'Debes aceptar los términos y condiciones',
  }),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Las contraseñas no coinciden",
  path: ["confirmPassword"],
});

type RegisterFormValues = z.infer<typeof registerSchema>;

export default function RegisterPage() {
  const navigate = useNavigate();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<RegisterFormValues>({
    resolver: zodResolver(registerSchema),
  });

  const onSubmit = async (data: RegisterFormValues) => {
    setIsSubmitting(true);
    try {
      const { error } = await supabase.auth.signUp({
        email: data.email,
        password: data.password,
        options: {
          data: {
            full_name: data.fullName,
          }
        }
      });

      if (error) throw error;

      toast.success('¡Registro exitoso! Por favor verifica tu correo.');
      navigate('/login');
    } catch (error: any) {
      toast.error(error.message || 'Error al registrarse');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="bg-mesh min-h-screen flex flex-col items-center justify-center text-on-surface selection:bg-primary-fixed selection:text-on-primary-fixed overflow-x-hidden">
      {/* Brand Header */}
      <header className="fixed top-0 w-full z-50 bg-surface/80 backdrop-blur-xl shadow-sm px-8 h-16 flex justify-between items-center border-b border-outline-variant/10">
        <div className="text-xl font-bold tracking-tighter text-primary flex items-center gap-2">
          <span className="material-symbols-outlined text-2xl">print</span>
          Precision & Paper
        </div>
        <div className="hidden md:flex gap-8">
          <span className="text-on-surface-variant font-headline font-semibold tracking-tight hover:text-primary transition-colors cursor-pointer text-sm">Ayuda</span>
        </div>
      </header>

      {/* Main Content Canvas */}
      <main className="w-full max-w-7xl px-4 pt-24 pb-12 flex flex-col items-center flex-grow">
        {/* Registration Card Container */}
        <div className="w-full max-w-md bg-surface-container-lowest rounded-xl shadow-lg shadow-on-surface/5 p-8 md:p-10 border border-outline-variant/10 relative">
          
          {/* Hero Typography */}
          <div className="mb-10 text-center">
            <h1 className="text-3xl font-extrabold tracking-tight text-on-surface mb-2 font-headline">Comienza ahora</h1>
            <p className="text-on-surface-variant font-body text-sm">Crea tu cuenta profesional para GestiPrint</p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
            {/* Full Name */}
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold uppercase tracking-wider text-on-surface-variant" htmlFor="fullName">Nombre Completo</label>
              <div className="relative group">
                <input
                  {...register('fullName')}
                  className={`w-full bg-surface-container-low border-b ${errors.fullName ? 'border-error' : 'border-outline-variant/20'} focus:border-primary focus:ring-0 px-4 py-3 text-on-surface placeholder:text-outline transition-all outline-none rounded-t-lg`}
                  id="fullName"
                  placeholder="Juan Pérez"
                  type="text"
                />
                <span className="absolute right-3 top-3.5 material-symbols-outlined text-outline group-focus-within:text-primary text-xl">person</span>
              </div>
              {errors.fullName && <p className="text-error text-xs">{errors.fullName.message}</p>}
            </div>

            {/* Email */}
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold uppercase tracking-wider text-on-surface-variant" htmlFor="email">Correo Electrónico</label>
              <div className="relative group">
                <input
                  {...register('email')}
                  className={`w-full bg-surface-container-low border-b ${errors.email ? 'border-error' : 'border-outline-variant/20'} focus:border-primary focus:ring-0 px-4 py-3 text-on-surface placeholder:text-outline transition-all outline-none rounded-t-lg`}
                  id="email"
                  placeholder="nombre@gestiprint.com"
                  type="email"
                />
                <span className="absolute right-3 top-3.5 material-symbols-outlined text-outline group-focus-within:text-primary text-xl">mail</span>
              </div>
              {errors.email && <p className="text-error text-xs">{errors.email.message}</p>}
            </div>

            {/* Password Row */}
            <div className="grid grid-cols-1 gap-6">
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold uppercase tracking-wider text-on-surface-variant" htmlFor="password">Contraseña</label>
                <div className="relative group">
                  <input
                    {...register('password')}
                    className={`w-full bg-surface-container-low border-b ${errors.password ? 'border-error' : 'border-outline-variant/20'} focus:border-primary focus:ring-0 px-4 py-3 text-on-surface placeholder:text-outline transition-all outline-none rounded-t-lg`}
                    id="password"
                    placeholder="••••••••"
                    type="password"
                  />
                  <span className="absolute right-3 top-3.5 material-symbols-outlined text-outline group-focus-within:text-primary text-xl">lock</span>
                </div>
                {errors.password && <p className="text-error text-xs">{errors.password.message}</p>}
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-semibold uppercase tracking-wider text-on-surface-variant" htmlFor="confirm_password">Confirmar Contraseña</label>
                <div className="relative group">
                  <input
                    {...register('confirmPassword')}
                    className={`w-full bg-surface-container-low border-b ${errors.confirmPassword ? 'border-error' : 'border-outline-variant/20'} focus:border-primary focus:ring-0 px-4 py-3 text-on-surface placeholder:text-outline transition-all outline-none rounded-t-lg`}
                    id="confirm_password"
                    placeholder="••••••••"
                    type="password"
                  />
                  <span className="absolute right-3 top-3.5 material-symbols-outlined text-outline group-focus-within:text-primary text-xl">verified_user</span>
                </div>
                {errors.confirmPassword && <p className="text-error text-xs">{errors.confirmPassword.message}</p>}
              </div>
            </div>

            {/* Terms */}
            <div className="flex flex-col gap-1 py-2">
              <div className="flex items-start gap-3">
                <input
                  {...register('terms')}
                  className="mt-1 h-4 w-4 rounded border-outline text-primary focus:ring-primary/20 cursor-pointer"
                  id="terms"
                  type="checkbox"
                />
                <label className="text-sm text-on-surface-variant cursor-pointer" htmlFor="terms">
                  Acepto los términos de servicio y la política de privacidad de GestiPrint.
                </label>
              </div>
              {errors.terms && <p className="text-error text-xs">{errors.terms.message}</p>}
            </div>

            {/* Primary Action */}
            <button
              disabled={isSubmitting}
              className="w-full py-4 bg-gradient-to-r from-primary to-primary-container text-on-primary font-headline font-bold rounded-xl shadow-lg shadow-primary/20 hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              type="submit"
            >
              {isSubmitting ? 'Creando Cuenta...' : 'Crear Cuenta'}
            </button>
          </form>

          {/* Secondary Action */}
          <div className="mt-8 text-center">
            <Link to="/login" className="text-sm font-medium text-secondary hover:text-primary transition-colors underline decoration-primary/30">
              ¿Ya tienes una cuenta? Iniciar sesión
            </Link>
          </div>
        </div>

        {/* Decorative Element */}
        <div className="mt-12 flex items-center gap-4 opacity-50 select-none">
          <div className="h-px w-12 bg-outline-variant"></div>
          <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-on-surface-variant">Certified Lithographic Workspace</div>
          <div className="h-px w-12 bg-outline-variant"></div>
        </div>
      </main>

      {/* Footer */}
      <footer className="w-full py-8 mt-auto bg-surface-container-low border-t border-outline-variant/10">
        <div className="flex flex-col md:flex-row justify-center items-center gap-6 w-full max-w-7xl mx-auto px-8 text-center md:text-left">
          <span className="font-body text-[10px] tracking-wide uppercase text-outline">© 2024 Precision & Paper. All rights reserved.</span>
          <div className="flex gap-6">
            <a className="font-body text-[10px] tracking-wide uppercase text-outline hover:text-primary underline decoration-primary/30 transition-all" href="#">Terms of Service</a>
            <a className="font-body text-[10px] tracking-wide uppercase text-outline hover:text-primary underline decoration-primary/30 transition-all" href="#">Privacy Policy</a>
            <a className="font-body text-[10px] tracking-wide uppercase text-outline hover:text-primary underline decoration-primary/30 transition-all" href="#">Contact Support</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
