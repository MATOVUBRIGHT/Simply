import { Building, Target, Eye, Users, ShieldCheck, Sparkles } from 'lucide-react';

export default function About() {
  return (
    <div className="space-y-8">
      <div className="text-center max-w-3xl mx-auto">
        <div className="w-20 h-20 mx-auto rounded-2xl bg-primary-500 flex items-center justify-center mb-6">
          <Building size={40} className="text-white" />
        </div>
        <h1 className="text-3xl font-bold text-slate-800 dark:text-white">About Our School</h1>
        <p className="text-slate-500 dark:text-slate-400 mt-4">
          Empowering students to achieve excellence through quality education and holistic development since 2005.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="card p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 rounded-lg bg-primary-100 dark:bg-primary-900/30">
              <Target size={24} className="text-primary-600 dark:text-primary-400" />
            </div>
            <h2 className="text-xl font-bold">Our Mission</h2>
          </div>
          <p className="text-slate-600 dark:text-slate-400">
            To provide a nurturing and inclusive learning environment that empowers students to become 
            confident, creative, and compassionate individuals prepared to face the challenges of a 
            rapidly changing world.
          </p>
        </div>

        <div className="card p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 rounded-lg bg-purple-100 dark:bg-purple-900/30">
              <Eye size={24} className="text-purple-600 dark:text-purple-400" />
            </div>
            <h2 className="text-xl font-bold">Our Vision</h2>
          </div>
          <p className="text-slate-600 dark:text-slate-400">
            To be a leading educational institution that cultivates academic excellence, character 
            development, and innovation, producing well-rounded graduates who contribute positively 
            to society.
          </p>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <h2 className="text-xl font-bold">Core Values</h2>
        </div>
        <div className="card-body">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { icon: ShieldCheck, label: 'Integrity', color: 'text-red-500' },
              { icon: Users, label: 'Teamwork', color: 'text-blue-500' },
              { icon: Target, label: 'Excellence', color: 'text-yellow-500' },
              { icon: Sparkles, label: 'Innovation', color: 'text-green-500' },
            ].map((value, idx) => (
              <div key={idx} className="text-center p-4 rounded-lg bg-slate-50 dark:bg-slate-700/50">
                <value.icon size={28} className={`mx-auto mb-2 ${value.color}`} />
                <p className="font-medium text-slate-800 dark:text-white">{value.label}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="text-center py-8 border-t border-slate-200 dark:border-slate-700">
        <p className="text-slate-500">
          Powered by <span className="font-semibold text-primary-500">Schofy</span> - School Management System
        </p>
      </div>
    </div>
  );
}
